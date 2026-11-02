# RLS and privilege review — Taiwan Kids Atlas

The database is reachable by anyone with the app in their hands (the publishable
`anon` key ships inside the bundle), so "row level security" here means: *the
anonymous internet may read published places and events and nothing else.*

This review is **executable**. [`scripts/ci/rls_check.sql`](../scripts/ci/rls_check.sql)
runs on every PR against a database with all migrations applied (CI job
`backend`, docs/ci-cd.md) and fails the build if the boundary moves.

```bash
# what CI does, locally:
docker compose up -d
for f in supabase/migrations/*.sql; do psql $DSN -v ON_ERROR_STOP=1 -q -f "$f"; done
psql $DSN -v ON_ERROR_STOP=1 -f scripts/ci/rls_check.sql
```

## 1. The model being verified

Source of truth: [architecture.md §7](architecture.md#7-security-model) and
migration [`20261102000600_security.sql`](../supabase/migrations/20261102000600_security.sql).

* Data lives in schema `atlas`, which is **not exposed** by PostgREST.
* Public read is only through 8 `public` functions (`places_search`,
  `place_detail`, `places_map`, `events_search`, `event_detail`,
  `categories_list`, `areas_list`, `app_meta`) — all `STABLE`, `SECURITY INVOKER`,
  so they run with the caller's privileges and are filtered by RLS.
* `anon` / `authenticated` additionally get `SELECT` on 5 readable tables and a
  **column subset** of `atlas.sources` (attribution only, never `config`, ETags or
  run bookkeeping), all behind RLS policies.
* `category_mappings`, `ingestion_runs`, `ingestion_errors` have no policy and no
  grant → invisible.
* Every `atlas.*` function is `REVOKE`d from `PUBLIC`; only `t`, `pick_lang`,
  `norm_zh` (used inside the API functions) are executable by `anon`.
* The ingestion surface (`start_run`, `upsert_*`, `finish_run`,
  `log_ingestion_error`, `purge`) is executable by `atlas_ingest`, `service_role`
  and `postgres`. The scheduling functions (`invoke_ingest`,
  `sync_cron_schedules`, `unschedule_all`) are `service_role` only and
  `SECURITY DEFINER` (they read Vault).

## 2. What was checked

`scripts/ci/rls_check.sql` asserts, and currently passes, all of:

| # | Check | Result |
|---|---|---|
| 1 | RLS is enabled on **every** `atlas` table (9 of 9) | pass |
| 2 | Each readable table (`places`, `events`, `event_occurrences`, `sources`, `categories`, `admin_areas`) has an `anon` `SELECT` policy | pass |
| 3 | `anon` **and** `authenticated` cannot `SELECT` `category_mappings`, `ingestion_runs`, `ingestion_errors` — nor the `atlas.source_health` view | pass |
| 4 | `anon` has no table-level `SELECT` on `atlas.sources`; the operational columns (`config`, `http_etag`, `http_last_modified`, `last_run_id`, `min_keep_ratio`, `schedule_cron`, `updated_at`) are unreadable while `attribution`, `license`, `license_url`, `publisher`, … remain readable (the licence 顯名聲明 requirement) | pass |
| 5 | `anon` can execute all 8 public API functions and they are **not** `SECURITY DEFINER`; `anon` can execute only the 3 i18n helpers in `atlas`; `anon`/`authenticated` cannot execute any of the 9 writer functions; `service_role` can execute the 3 scheduling functions and they **are** `SECURITY DEFINER`; `atlas_ingest` can execute the ingestion lifecycle | pass |
| 6 | The `public` schema contains no application table (only PostGIS's `spatial_ref_sys`), so nothing is accidentally exposed by PostgREST | pass |
| 7 | Behaviour, as a real `set local role anon` session: reading `ingestion_runs`, `sources.config`, `start_run()` and `invoke_ingest()` all raise `insufficient_privilege`; reading `atlas.places` and `atlas.event_occurrences` succeeds and returns **0 soft-deleted rows**; `public.app_meta()` works | pass |

Verified on 2026-11-03 against `imresamu/postgis:17-3.5` with all 8 migrations and
the seed applied (`6,292` visible places → the RLS filter is active, not a
trivially empty table), and again on the Supabase CLI stack
(`supabase/postgres:17.11.0.011`, with the real `anon`/`authenticated`/
`service_role` roles).

**Negative test** (the check is not vacuous): granting `select on
atlas.ingestion_runs to anon` makes the check fail immediately with
`SECURITY: anon can SELECT atlas.ingestion_runs`; revoking it makes it pass again.

## 3. Residual risks and recommendations

| # | Risk | Severity | Recommendation |
|---|---|---|---|
| R1 | `atlas.source_health` is a view owned by `postgres` without `security_invoker = true`. It is not granted to `anon`, so it is unreachable today — but if it (or any view) were ever granted or exposed, pre-PG15 semantics would bypass the underlying tables' RLS | low | add `alter view atlas.source_health set (security_invoker = true);` in a future migration (migration files are append-only, so it is not retrofitted here) |
| R2 | Supabase's PostgREST must expose **only** `public`. If someone adds `atlas` to the exposed schemas in the dashboard, RLS still applies but the raw tables become reachable | medium | keep the exposed-schema list at `public` (Supabase → Settings → API → Exposed schemas); `scripts/ci/rls_check.sql` protects the grants, not that dashboard setting |
| R3 | Tables have RLS **enabled but not forced**, so the table owner (`postgres`) bypasses policies. That is what makes the ingestion SQL simple | by design | never create the app or the worker with a role that owns these tables; the Edge Function uses the provided `SUPABASE_DB_URL` (owner) — acceptable because it is server-side only |
| R4 | `atlas_ingest` is `NOLOGIN` and granted to nobody. Enabling the GitHub-Actions ingestion fallback (ADR-0004) means creating a login role for it | low | `create role ingest_writer login password '<secret>' in role atlas_ingest;` — that DSN is then limited to the ingestion surface, not to `service_role` |
| R5 | `authenticated` has the same read grants as `anon`. Nothing signs a user in today, so it is dormant | low | if accounts are ever added, re-run this review with real JWTs: the policies are written for `anon, authenticated` and would need a per-user dimension (favourites are device-local by design today) |
| R6 | The `service_role` key bypasses RLS entirely. A leak is a full compromise | high if leaked | it never leaves the server: it is not in the app, not in CI, not in git (`no-secrets` job). Rotate immediately if it ever ships |
| R7 | Location privacy: the device sends coordinates only as query parameters | by design | already true in the API contract; keep the server from ever persisting them |

## 4. Re-running the review after a schema change

Any migration that adds a table, a function or a grant must keep the check green.
The three lines that break most often:

* a new table added to schema `atlas` **without** `enable row level security`;
* a new writer function without `revoke execute … from public`;
* a new column on `atlas.sources` that should not be public (add it to
  `priv_cols` in the check).

Update the arrays at the top of `scripts/ci/rls_check.sql` at the same time as the
migration — the check is intentionally explicit, so a new object has to be
acknowledged.
