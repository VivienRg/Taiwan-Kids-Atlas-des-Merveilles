# ADR-0004: Ingestion runtime — one Deno TypeScript core; Supabase Edge Function + pg_cron in prod, CLI in dev

- Status: Accepted
- Date: 2026-11-02

## Context

- The ingestion job must run on a schedule against Supabase in prod and against local Postgres in dev.
- It must be idempotent, retry with backoff, and record every run in `ingestion_runs`.
- Feed sizes measured on 2026-11-02:
  - Tourism Administration attractions: 3.15 MB zip, 16.4 MB JSON, 6,205 records.
  - Tourism Administration events: 0.5 MB zip.
  - Ministry of Culture kids events: tens of KB.
  - Upserting all 6,205 places took about 4 s locally in 13 batches of 500.

## Decision

- **A single TypeScript core on Deno.** Deno is the Supabase Edge runtime.
  - Files: `supabase/functions/_shared/ingest/`.
  - Adapters handle fetch, parse and normalise per source.
  - All persistence logic is in SQL functions (`atlas.start_run`, `upsert_places`, `upsert_events`,
    `finish_run`, `log_ingestion_error`), already implemented in the migrations. The worker stays thin and
    behaves the same on every runtime.
  - DB access goes through `npm:postgres` using `SUPABASE_DB_URL` (Edge) or `DATABASE_URL` (CLI).
- **Prod:** a Supabase Edge Function `ingest` (JWT verification off, guarded by a shared secret).
  - It is invoked by **pg_cron → `atlas.invoke_ingest(source)` → pg_net POST**, one cron job per enabled
    source. Schedules live in `atlas.sources.schedule_cron` and are applied by `atlas.sync_cron_schedules()`.
  - The function calls `start_run` synchronously, returns 202, and finishes the run in
    `EdgeRuntime.waitUntil`.
- **Dev:** `deno task ingest --source <id>|--all` against any Postgres with the migrations.
  - The prod-like loop (`supabase start` + `functions serve` + Vault secrets) is documented in ingestion.md §7.
  - On a vanilla Postgres without pg_cron, run the CLI on demand or from a crond compose service.
- **Fallback (not default):** if Edge Function limits (wall clock, memory) prove too tight for the 16 MB
  attractions file, run the same CLI from a scheduled GitHub Actions workflow with `DATABASE_URL` as a
  secret, and keep pg_cron for the small feeds. The switch needs no code changes.

## Alternatives considered

| Option | Why not (as default) |
|---|---|
| GitHub Actions cron only | Adds a third platform holding DB credentials. Cron drift and minimum intervals are coarse. The repo's existing Actions are for the static site. Kept as the fallback. |
| A long-running worker (Fly/Render) | A paid always-on service for two short daily jobs. |
| Pure SQL ingestion (`pg_net` GET + plpgsql parsing) | Cannot unzip. JSON-parsing large payloads in plpgsql is fragile, and HTTP retry logic in SQL is awkward. |
| Node instead of Deno | Edge Functions are Deno. Two runtimes would split the code. |

## Consequences

- One codebase to test, with unit tests on adapters and integration tests on the SQL functions.
- Secrets per environment:
  - Vault: `ingest_function_url`, `ingest_cron_secret`.
  - Function secret: `INGEST_CRON_SECRET`.
  - CLI: `DATABASE_URL`.
- Edge memory risk on the 16 MB JSON must be measured during implementation. If it is too high, take the
  fallback rather than streaming-parse heroics.
- pg_net requests are fire-and-forget. The truth about a run is always in `atlas.ingestion_runs`, which
  monitoring reads through `atlas.source_health`.
