# CI/CD — Taiwan Kids Atlas

What runs automatically, what a human triggers, and how to reproduce every gate
locally. The short version: **CI never deploys anything.** Migrations are applied
to a throwaway container; the hosted project and the stores are only touched by
workflows a human starts and approves ([release.md](release.md)).

## 1. Pipelines

| Workflow | Trigger | Purpose |
|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | every PR, every push to `main`, manual | the 3 gates below |
| [`validate-json.yml`](../.github/workflows/validate-json.yml) | PRs touching `data/**.json` | static-site data vs `data/activity.schema.json` |
| [`issue-to-pr.yml`](../.github/workflows/issue-to-pr.yml) | community issue form | existing community contribution flow (unchanged) |
| [`generate-thumbnails.yml`](../.github/workflows/generate-thumbnails.yml) | manual | existing thumbnails refresh (needs `GOOGLE_MAPS_API_KEY`) |
| [`ingest-health.yml`](../.github/workflows/ingest-health.yml) | daily 03:30 UTC, manual | ingestion alerting ([observability.md](observability.md)) |
| [`ingest-run.yml`](../.github/workflows/ingest-run.yml) | manual only | run the ingestion worker from CI ("run now", `curated` import, ADR-0004 fallback); `production` environment |
| [`supabase-deploy.yml`](../.github/workflows/supabase-deploy.yml) | manual only | plan / migrate / function / secrets / cron on the hosted project — **gated by the `production` environment + `confirm: APPLY`** |
| [`eas-build.yml`](../.github/workflows/eas-build.yml) | manual only | EAS builds and store submission — **gated the same way** |

### `ci.yml`

| Job | Steps |
|---|---|
| `backend` | Postgres 17 + PostGIS service → apply `supabase/migrations/*.sql` in order → load `supabase/seed.sql` → `scripts/ci/rls_check.sql` → `deno task check` (`deno lint`, `deno check`, unit + Postgres integration tests) |
| `mobile` | `npm ci` → `npm run lint` (0 errors) → `npm run typecheck` (`tsc --noEmit`) → `npm test` (Jest) → `npx expo config` (resolves `app.json` + `app.config.ts`) |
| `no-secrets` | `python3 scripts/ci/secret_scan.py` over every tracked file |

`main` is protected by these three jobs. The repository has no required status
checks configured from CI's side — the owner sets them in
Settings → Branches → Require status checks (`Backend …`, `Mobile …`,
`No committed secrets`).

## 2. Reproducing the gates locally

```bash
# backend (the whole gate, exactly as CI runs it)
docker compose up -d                                     # PostGIS on localhost:54330
for f in supabase/migrations/*.sql; do
  psql "postgresql://postgres:postgres@localhost:54330/atlas_dev" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "postgresql://postgres:postgres@localhost:54330/atlas_dev" -f supabase/seed.sql
psql "postgresql://postgres:postgres@localhost:54330/atlas_dev" -f scripts/ci/rls_check.sql
cd supabase/functions
DATABASE_URL=postgresql://postgres:postgres@localhost:54330/atlas_dev deno task check
#   deno task lint | deno task typecheck | deno task test | deno task fmt (not a gate)

# mobile
cd mobile && npm ci && npm run lint && npm run typecheck && npm test
npx expo config --type public --json > /dev/null

# secrets
python3 scripts/ci/secret_scan.py
```

The Deno integration test **skips itself** when no Postgres is reachable
(`ok  integration tests (skipped: no reachable Postgres)`), so `deno task test`
is usable without Docker — but then it proves less. CI always has the database.

## 3. Deliberate non-gates

| Not gated | Why |
|---|---|
| `deno fmt --check` | the backend was hand-formatted before `deno.json` had a `fmt` section; adopting `deno fmt` is a whole-tree reformat and belongs in its own commit. `deno task fmt` uses the repo's style (single quotes, 100 columns) |
| live ingestion (`deno task ingest --all`) | network-dependent and rate-limited by upstream; the adapter output is pinned by golden fixtures instead ([ingestion.md §9](ingestion.md#9-tests-the-backend-card-must-provide)), and QA runs the live smoke by hand |
| Expo/EAS native builds on PRs | they cost EAS credits and minutes; the mobile gate compiles the app (tsc + Jest + config resolution) and `eas-build.yml` builds on demand |
| iOS/Android UI tests | no device farm in scope; QA drives the simulator/emulator by hand (t_0d703d46) |

## 4. Branch and release flow

```
feature branch → PR → ci.yml (3 jobs) → reviewer → merge to main → ci.yml on main
                                                              ↓
                                        actions: plan → migrate → function → secrets → cron-enable
                                                              ↓
                                        actions: eas build (preview → production) → eas submit
```

* Migrations are **append-only**: once a file has been applied to the hosted
  project, never edit it — add a new `supabase/migrations/<timestamp>_*.sql`.
  CI applies the whole directory from scratch every run, so a broken ordering or
  a missing grant fails immediately.
* `scripts/ci/rls_check.sql` must be updated together with any migration that adds
  a table, a function or a grant ([rls-review.md §4](rls-review.md#4-re-running-the-review-after-a-schema-change)).
* Secrets never enter a workflow file: values pass through `env:` from GitHub
  secrets, and `no-secrets` fails the PR if one is ever committed
  ([secrets.md](secrets.md)).

## 5. The approval model

Three independent locks sit between this repository and real users:

1. **GitHub Environment `production`** with required reviewers — every write job
   in `supabase-deploy.yml` and the production/submit jobs in `eas-build.yml`
   target it, so GitHub pauses the job until a human approves.
2. **`confirm: APPLY`** — a workflow input that the job checks before running a
   single command; a mis-click on Run workflow cannot deploy.
3. **Manual dispatch only** — none of those workflows has a `push` or `schedule`
   trigger.

The scheduled jobs that *do* run unattended (`ingest-health.yml`, and Supabase's
own pg_cron inside the project) only read, or only write to the `atlas` schema
through functions that were reviewed at deploy time.
