# Observability — Taiwan Kids Atlas

Two things can break silently: **the ingestion stops delivering data**, and **the
app crashes on someone's phone**. Neither is visible from a green CI run.

| Layer | Signal | Where it surfaces | Wired up? |
|---|---|---|---|
| Ingestion | `atlas.source_health` thresholds | daily **Ingestion health** workflow → GitHub notification (email) | yes, once prod credentials exist |
| Ingestion | per-run audit trail | `atlas.ingestion_runs` / `ingestion_errors` (SQL) + Edge Function logs (Supabase dashboard) | yes |
| Ingestion | optional fan-out to Slack/webhook | `pg_net` POST from SQL, or a Slack step in the workflow | documented below, off by default |
| API | PostgREST/Edge error rates | Supabase dashboard → Logs | platform-provided |
| App | JS crashes, non-fatal errors, release health | Sentry (recommended) | **not implemented** — needs an account + a DSN (§4) |
| Uptime | `GET /rest/v1/rpc/app_meta` reachable from a synthetic location | Better Stack / UptimeRobot free tier | **not implemented** — owner decision |

Everything an agent could prepare without an account is prepared; the two
"not implemented" rows need a human to create the account and paste one value.

## 1. Ingestion failures

### 1.1 The audit trail (always on)

Every run writes one row to `atlas.ingestion_runs` (status, counters, error class,
details, ETag) and at most 500 rows per run to `atlas.ingestion_errors`
(per-record or per-stage errors). Nothing is sampled and nothing is dropped, so a
failure can always be reconstructed after the fact:

```bash
psql "$DATABASE_URL" <<'SQL'
select id, source, status, started_at, finished_at - started_at as took,
       records_fetched, records_inserted, records_updated, records_unchanged,
       records_removed, error_class, left(error_message, 120) as error
  from atlas.ingestion_runs order by id desc limit 20;

select run_id, stage, source_record_id, message
  from atlas.ingestion_errors order by id desc limit 20;
SQL
```

Error classes ([ingestion.md §6](ingestion.md#6-retries-backoff-timeouts-and-rate-limiting)):
`network`, `http_4xx`, `http_5xx`, `blocked`, `parse`, `validation`, `db`,
`timeout`, `guard`, `unknown`. Two of them mean *"the upstream changed"* rather
than *"we have a bug"*: `parse` (feed format moved) and `blocked` (a WAF — this
is what disabled the Taipei Travel source, ADR-0003).

### 1.2 The daily check and its alert

`scripts/ops/ingest_health.sql` reads the audit tables (no writes), prints the
per-source health table and **exits non-zero** when an enabled source breaches a
threshold. It is run every day at 03:30 UTC (11:30 Asia/Taipei) by
[`ingest-health.yml`](../.github/workflows/ingest-health.yml).

| Threshold | Meaning |
|---|---|
| `hours_since_success > 36` | two scheduled windows missed in a row |
| `consecutive_failures >= 2` | repeated `failed` / `partial` / `abandoned` runs |
| `last_error_class = 'blocked'` | upstream is refusing us (WAF/challenge) |
| enabled + scheduled but **never** succeeded | misconfiguration or a dead feed |
| `active_records < 80 %` of the rows the last successful run saw | mass-removal guard, i.e. the second net behind `min_keep_ratio` |

A failing scheduled workflow emails the repository owner — that is the free,
zero-configuration alert channel. To make it noisier (Slack), add a step:

```yaml
      - name: Notify Slack
        if: failure()
        env:
          WEBHOOK: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          [ -n "${WEBHOOK:-}" ] && curl -sS -X POST -H 'Content-type: application/json' \
            --data '{"text":"Taiwan Kids Atlas: ingestion health check failed — see the Actions run"}' \
            "$WEBHOOK"
```

Run the check by hand any time:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/ingest_health.sql
```

### 1.3 Logs

The worker prints one JSON object per line
(`{ts, level, source, run_id, stage, event, msg, …counters}`, stages
`start → fetch → parse → normalize → upsert → finish`). In prod they land in
Supabase → Edge Functions → Logs. It never logs secrets, full rows or request
headers; the durable truth is always the database, because pg_net delivery is
fire-and-forget.

In-process alerting from inside Postgres is possible without any new service:
`atlas.invoke_ingest` already shows the pattern (`net.http_post` with a Vault
secret), so a `postgresql://`-side check could POST to a webhook. It is
deliberately *not* enabled: a scheduled SQL job cannot be reviewed as easily as a
workflow, and the daily workflow covers the same ground.

### 1.4 Caveats measured on the local Supabase stack (2026-11-03)

These were found by driving the real path (Vault → pg_net → Kong → Edge Function)
on `supabase/postgres:17.11.0.011` + edge-runtime 1.77.9 instead of reasoning about
it, and they are the reason for two changes in this task:

* **A request that outlives the caller is cancelled, not just logged.** The
  ingest function now answers `202` as soon as `start_run` created the run row and
  continues in `EdgeRuntime.waitUntil` (`supabase/functions/ingest/index.ts`).
  Before that change the response was held open for the whole run; pg_net's 10 s
  client timeout fired, the runtime logged `WorkerRequestCancelled`, and the run
  stayed `running` until the 2 h sweeper with nothing ingested. The Supabase
  gateway (Kong) adds its own ~60 s limit and returned `504` in the same test.
  Consequence to remember when debugging: **`status = 'running'` with no progress
  usually means the request was cut off**, not that the feed is slow.
* **`net._http_response` is the client-side view.** A `202` there means "the
  function accepted it", never "the run succeeded": the run's own outcome is in
  `atlas.ingestion_runs`.
* **No `curl` inside the Edge runtime** (verified: `curl: not found` in the
  container). The curl fallback in `_shared/ingest/http.ts` is a
  developer/CLI convenience for hosts where Deno's fetch misbehaves (it needs
  `--allow-run=curl`, which the `ingest` task now grants — without it the
  fallback failed with "Requires run access to curl", i.e. the CLI could not
  ingest at all on a host where Deno's fetch is blocked); in prod a Deno fetch
  failure is a real failure and surfaces as `error_class = network` after the
  retries ([ingestion.md §6](ingestion.md#6-retries-backoff-timeouts-and-rate-limiting)).
* **The isolate has a wall-clock budget and it is a hard stop.** Locally the
  runtime logged `wall clock duration warning` and then `wall clock duration
  reached … (in_flight_req_exists = false)` about 200 s in, tearing down the
  background work. Supabase documents 150 s (free) / 400 s (paid) for the same
  budget. A run that cannot finish inside it stays `running` until the 2 h
  sweeper: use the CI fallback below, or narrow the source (e.g. split the
  attractions feed) if it ever happens in prod.
* **The 16 MB attractions JSON in a small isolate is R4** (ADR-0004). If it OOMs
  in prod, run the same worker from CI instead — `.github/workflows/ingest-run.yml`
  is ready for that and only needs a `schedule:` trigger to take over from
  pg_cron.

## 2. Recommended thresholds in one place

Change them in `scripts/ops/ingest_health.sql` (one `raise exception` block) and,
if you change the *ingestion* guard, in `atlas.sources.min_keep_ratio`
(`0.80` attractions, `0.50` event feeds).

## 3. API-level monitoring (optional, cheap)

* Supabase → Logs covers PostgREST/Edge errors once traffic exists.
* A synthetic check on `GET https://<ref>.supabase.co/rest/v1/rpc/app_meta?lang=en`
  with the anon key returns the source list without touching user data — a good
  5-minute-interval uptime probe (Better Stack, UptimeRobot, or a workflow with
  `schedule:`).

## 4. Crash reporting and app telemetry — recommendation

**Recommendation: Sentry (`@sentry/react-native`) with the Expo config plugin.**
It is the only option that covers both platforms, Hermes stack traces, release
health and source maps in one free-tier product, and it needs one DSN plus one
build-time token.

Why not the alternatives: Firebase Crashlytics requires Google Services files on
both platforms (an extra native dependency in a managed Expo project) and is
Android-first; EAS's own monitoring is still young.

Integration (when the owner has the account — this is a mobile-card-sized change,
deliberately not done here because it needs a DSN and touches the native config):

```bash
cd mobile
npx expo install @sentry/react-native
npx @sentry/wizard -i reactNative -p ios android   # or add the plugin manually
```

```jsonc
// app.json → expo.plugins
["@sentry/react-native/expo", { "organization": "…", "project": "taiwan-kids-atlas" }],
// app.config.ts → extra: env-driven DSN (public by design, like the anon key)
// EXPO_PUBLIC_SENTRY_DSN = https://<key>@o<org>.ingest.sentry.io/<project>
```

Then wrap the root layout (`app/_layout.tsx`) with
`Sentry.wrap(require('expo-router/entry'))` or the documented React Navigation
wrapper, and set `tracesSampleRate: 0.1`, `sendDefaultPii: false`.

**Privacy constraints that the integration must respect** (they follow from
[rls-review.md §3](rls-review.md#3-residual-risks-and-recommendations) and
architecture.md §7): no location coordinates in breadcrumbs or events, no device
favourites payloads, `sendDefaultPii: false`, and no user identifiers — the app
has no accounts. `EXPO_PUBLIC_SENTRY_DSN` goes into the EAS environment variables
per profile ([secrets.md §4](secrets.md#4-eas-environment-variables)), never into
git; the DSN is public-by-design but environment-specific.

Until it is wired, the release-time signal is what CI already gives: the Jest
suite, `tsc`, ESLint, and — for a build that won't boot — EAS Build failing at the
bundle step rather than on a user's phone.
