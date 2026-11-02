# Release runbook — Taiwan Kids Atlas

How a human takes this repository from a green `main` to a live Supabase backend
and installable Android/iOS builds.

**Nothing in this document has been executed by an agent. Every write step is a
human action, and the automatic paths are all gated behind an explicit approval**
(`workflow_dispatch` + `confirm: APPLY` + the `production` GitHub Environment).

| | |
|---|---|
| Automated on every PR | lint, typecheck, tests, migrations on a throwaway Postgres, RLS review, secret scan ([ci-cd.md](ci-cd.md)) |
| Automated on a schedule | the ingestion cron *inside* Supabase, once you enable it (§4) and the daily health check ([observability.md](observability.md)) |
| Human-only | everything that touches the hosted project or a store (§2–§6) |

Related documents: [architecture.md](architecture.md) (design, environments,
security model), [ingestion.md](ingestion.md) (cron, thresholds),
[secrets.md](secrets.md) (where each credential lives),
[release-credentials.md](release-credentials.md) (accounts to create),
[observability.md](observability.md) (alerts and crash reporting).

---

## 0. One-time setup (owner)

Do this once, before the first release.

1. **Approve the open owner decisions** in [architecture.md §10](architecture.md#10-risks-and-open-questions):
   - R7: confirm the app identifier `com.taiwankidsatlas.app` (it can never change after the first store upload).
   - R8: choose the Supabase region — `ap-northeast-1` (Tokyo) or `ap-southeast-1` (Singapore), whichever is closer to the audience.
   - R10: add the missing `LICENSE` file (the README already claims MIT).
2. **Create the Supabase project** (dashboard → New project): Postgres 17, the region from R8, a strong database password stored in a password manager.
3. **Create the GitHub Environment** `production` (repository → Settings → Environments) and add **required reviewers** (yourself is allowed). Every write workflow in this repository deploys into that environment, so it pauses here until someone approves. This is the release approval gate.
4. **Add the repository secrets** listed in [secrets.md §3](secrets.md#3-github-actions-secrets). Nothing else deploys until these exist.
5. **Charge the EAS account** (Expo free tier is enough for the first builds; a production iOS build on the free tier queues and is iOS-simulator-unlimited).
6. Work through [release-credentials.md](release-credentials.md) — Apple Developer Program membership and a Google Play Console account are the two items with lead times (Apple review takes days).

## 1. Pre-flight (safe, read-only)

```bash
# Local: the full gate, exactly what CI runs.
docker compose up -d                                     # PostGIS on 54330
for f in supabase/migrations/*.sql; do
  psql "postgresql://postgres:postgres@localhost:54330/atlas_dev" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "postgresql://postgres:postgres@localhost:54330/atlas_dev" -f supabase/seed.sql
psql "postgresql://postgres:postgres@localhost:54330/atlas_dev" -f scripts/ci/rls_check.sql
(cd supabase/functions && DATABASE_URL=postgresql://postgres:postgres@localhost:54330/atlas_dev deno task check)
(cd mobile && npm ci && npm run lint && npm run typecheck && npm test)
```

Then, against the hosted project (read-only) — GitHub → Actions → **Supabase
(production, manual)** → Run workflow → `action: plan`. It links the project,
prints `supabase db push --dry-run` (the migrations that *would* apply) and the
deployed functions. `plan` needs no confirmation and writes nothing.

## 2. Deploy the database migrations

Only after `plan` shows exactly the migrations you expect.

1. Actions → **Supabase (production, manual)** → `action: migrate`, `confirm: APPLY`.
2. Approve the `production` environment when GitHub asks (this is the human gate).
3. The job runs `supabase link --project-ref "$SUPABASE_PROJECT_REF"` then `supabase db push`. `db push` applies only the migration files that are not yet recorded in `supabase_migrations.schema_migrations`, in filename order.

What this creates: schema `atlas` (data), the 8 `public` RPC functions, RLS
policies, grants, and the *inert* scheduling functions. It schedules nothing.

Verify (read-only, from your machine — the `DATABASE_URL` is the pooler or
direct connection string with the database password):

```bash
psql "$DATABASE_URL" -c "select count(*) from atlas.places;"              # 87 seeded-or-imported rows
psql "$DATABASE_URL" -c "select source, enabled from atlas.sources order by source;"
psql "$DATABASE_URL" -c "select jobname from cron.job;"                  # empty: nothing scheduled yet
```

> **Migrations are append-only.** Never edit a migration that has been applied to
> the hosted project; add a new file. `db push` will otherwise report a
> divergence and refuse to continue.

## 3. Deploy the ingest Edge Function and its secrets

1. Actions → **Supabase (production, manual)** → `action: secrets`, `confirm: APPLY`.
   - Set `INGEST_CRON_SECRET` in the repository secrets **first** (a random 32+ byte string, e.g. `openssl rand -hex 32`). The workflow pushes `INGEST_CRON_SECRET`, `INGEST_LOG_LEVEL=info` and `INGEST_DEADLINE_MS=120000` to the function runtime. It never prints them.
2. Actions → same workflow → `action: function`, `confirm: APPLY`.
   - Deploys `ingest` with JWT verification off (`supabase/config.toml`, `[functions.ingest] verify_jwt = false`); the function authenticates the caller itself with the shared secret.
3. Smoke-test the function without touching any data:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  "https://<project-ref>.supabase.co/functions/v1/ingest" \
  -H "Authorization: Bearer $INGEST_CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"source":"does_not_exist","trigger":"manual"}'
# expect 400 (unknown_source)
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  "https://<project-ref>.supabase.co/functions/v1/ingest" -d '{}'
# expect 401 (unauthorized)
```

## 4. Enable the ingestion cron

The scheduler is pg_cron → `atlas.invoke_ingest(source)` → pg_net → the Edge
Function. Schedule times live in `atlas.sources.schedule_cron`
([ingestion.md §2](ingestion.md#2-schedule)).

1. **Store the two Vault secrets** (SQL editor, project owner). They are read by
   `atlas.invoke_ingest`, which is `service_role`-only and `SECURITY DEFINER`:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/ingest',
                           'ingest_function_url');
select vault.create_secret('<the same value as INGEST_CRON_SECRET>',
                           'ingest_cron_secret');
-- verify without printing the values:
select name from vault.secrets where name in ('ingest_function_url','ingest_cron_secret');
```

2. **Run each enabled source once by hand**, so the first scheduled run has valid
   ETags and the health view has a baseline. Edge Function runs are bounded
   (`INGEST_DEADLINE_MS=120000`); the 6,205-row attractions feed needs a few
   seconds, and a re-run returns 304 with zero writes (idempotent by design):

```bash
for src in tw_tourism_attractions tw_tourism_events moc_kids_events; do
  curl -sS -X POST "https://<project-ref>.supabase.co/functions/v1/ingest" \
    -H "Authorization: Bearer $INGEST_CRON_SECRET" \
    -H 'Content-Type: application/json' \
    -d "{\"source\":\"$src\",\"trigger\":\"manual\"}"
done
psql "$DATABASE_URL" -c "select id, source, status, records_fetched, records_inserted, error_class
                           from atlas.ingestion_runs order by id desc limit 10;"
```

   The `curated` source has no schedule: import it on demand
   (`deno task ingest --source curated`) or re-run it from CI when
   `data/activities.json` changes.

3. **Turn the cron on.** Either Actions → **Supabase (production, manual)** →
   `action: cron-enable`, `confirm: APPLY`, or the SQL editor:

```sql
select atlas.sync_cron_schedules();   -- -> atlas_ingest_tw_tourism_attractions, …, atlas_purge
select jobname, schedule, active from cron.job order by jobname;
```

4. **The pause switch / rollback is one call**: `select atlas.unschedule_all();`
   (Actions → `action: cron-disable`). The migrations themselves never schedule
   anything — enabling is always this deliberate step.

## 5. Verify after the first scheduled window

```bash
psql "$DATABASE_URL" -f scripts/ops/ingest_health.sql   # prints health, exits non-zero on a breach
psql "$DATABASE_URL" -c "select jobname, schedule, active from cron.job order by jobname;"
psql "$DATABASE_URL" -c "select id, status_code, timed_out from net._http_response order by id desc limit 5;"
```

Expected after the 16:15–16:40 Taipei window (08:15–08:40 UTC): every enabled
source `succeeded` or `skipped` (304), `hours_since_success` < 24,
`consecutive_failures` 0, `active_records` > 0, and `net._http_response` rows with
`status_code = 202` and `timed_out = false` (a timeout there means the function
was cut off — see observability.md §1.4). A breach fails the daily **Ingestion
health** workflow, which emails the repository owner
([observability.md](observability.md)).

To run the ingestion on demand (first baseline, a retry after an upstream outage,
or the unscheduled `curated` import), use Actions → **Ingest now (manual)**
(`.github/workflows/ingest-run.yml`) with `source: all` — it runs the same worker
from CI against the least-privilege `INGEST_DATABASE_URL` role, and it is also the
ADR-0004 fallback if the Edge runtime proves too small for the attractions feed
(add a `schedule:` trigger to that workflow and disable the pg_cron jobs).

## 6. Build and ship the apps

### 6.1 Preview (no store accounts needed)

Actions → **EAS build / submit (manual)** → `action: build`, `platform: all`,
`profile: preview`. This produces:

| Platform | Artifact | Install |
|---|---|---|
| Android | APK (`buildType: apk`) | `adb install` the link from the EAS dashboard |
| iOS | simulator build (`simulator: true`) | unzip and run on a simulator; **not** installable on a device |

Both need only `EXPO_TOKEN`. `profile: preview-device` additionally produces an
ad-hoc IPA for registered devices — that one needs the Apple Developer account
and the devices registered with EAS (`eas device:create`).

### 6.2 Store builds (Apple/Google accounts required)

1. Actions → **EAS build / submit (manual)** → `action: build`,
   `profile: production`, `confirm: APPLY`, and approve the `production`
   environment. Output: an **AAB** (Play) and a store **IPA** (App Store).
2. Actions → same workflow → `action: submit`, `confirm: APPLY`, approve again.
   `eas submit --profile production --latest` uploads the IPA to **TestFlight**
   (App Store Connect) and the AAB to the Play **internal testing** track
   (`submit.production.android.track: internal` in `mobile/eas.json`).
3. Promote, when you decide to: Play Console → internal testing → closed/open
   testing → production; App Store Connect → TestFlight → submit for review.
   Promote from the consoles, not from CI: that keeps the last human judgement
   before real users.

Store credentials (Apple API key, Play service account) are uploaded once to EAS
themselves — `eas credentials` — and never enter this repository
([release-credentials.md](release-credentials.md)).

## 7. Rollback

| Failure | Action | Time |
|---|---|---|
| Ingestion misbehaving (bad feed, mass removals) | `select atlas.unschedule_all();` (or `action: cron-disable`) — stops all ingestion within seconds | seconds |
| One bad source only | `update atlas.sources set enabled = false where id = '<source>';` then `select atlas.sync_cron_schedules();` | seconds |
| Bad Edge Function deploy | redeploy the previous good revision: check out the last good commit on `main` and run `action: function` again | minutes |
| Bad data import (curated, or a wrong feed) | data is soft-deleted (`removed_at`), never hard-deleted inside 90 days: re-run the ingest with the fixed input, or `update atlas.places set removed_at = null where …` for the affected source | minutes |
| Bad migration | **forward-fix only**: add a new migration and `action: migrate`. If the schema is genuinely broken, Supabase's point-in-time recovery / daily backup (dashboard → Database → Backups) restores the project to a timestamp; confirm backups are enabled before you rely on it | minutes–hours |
| App regression | a new build must ship (EAS Update/OTA is not installed): fix, bump, re-submit; on Play you can **halt rollout** on a staged release, on TestFlight you can stop testing the build | hours |
| Secret leaked | rotate it at the source (Supabase dashboard / Apple / Google / Expo), then update the GitHub secret and re-run `action: secrets` for the function runtime, plus `select vault.update_secret(...)` for `ingest_cron_secret` | minutes |

Deliberately absent: automatic down-migrations. Supabase keeps no migration
rollback, and the schema is the contract the app is built against.

## 8. Release checklist

```
[ ] CI green on main (GitHub → Actions → CI)
[ ] Owner decisions R7/R8/R10 closed (architecture.md §10)
[ ] `production` GitHub Environment exists with required reviewers
[ ] Repository secrets set (secrets.md §3)
[ ] action: plan  → shows the intended migrations, nothing unexpected
[ ] action: migrate (APPLY)         → migrations applied
[ ] action: secrets (APPLY)         → INGEST_CRON_SECRET on the function
[ ] action: function (APPLY)        → ingest deployed; 401/400 smoke test passes
[ ] Vault: ingest_function_url, ingest_cron_secret
[ ] one manual run per enabled source → ingestion_runs say succeeded
[ ] action: cron-enable (APPLY)     → cron.job lists atlas_ingest_* + atlas_purge
[ ] next window: scripts/ops/ingest_health.sql is clean
[ ] EAS preview build installs on a real Android device and a simulator
[ ] EAS production build + submit → TestFlight / Play internal testing
[ ] release notes + screenshot pass on the store listings
```
