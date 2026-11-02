# Secrets and configuration — Taiwan Kids Atlas

The single inventory of every value that must **not** be committed, where it
lives, and how it is rotated. It complements
[architecture.md §8](architecture.md#8-configuration-and-secrets) (which explains
the design) with the operational answer: *where do I set this value?*

The rule the CI job `no-secrets` enforces (`scripts/ci/secret_scan.py`, run on
every PR): only `.env.example` placeholders and loopback DSNs are allowed in
tracked files. Everything below lives in a GitHub Actions secret, an EAS
environment variable, Supabase (function secrets or Vault), or the operator's
machine.

## 1. Where each value lives

| Value | dev (local) | prod / CI | Committed? |
|---|---|---|---|
| `DATABASE_URL` (worker → Postgres) | `supabase/functions/.env` (git-ignored) or `docker compose` default | GitHub secret `SUPABASE_DB_URL` (health check, CLI fallback) + the platform-provided `SUPABASE_DB_URL` inside Edge Functions | no — the loopback default in `.env.example` / docs is allowed by the scanner |
| `INGEST_CRON_SECRET` | any dev string in `supabase/functions/.env` | Supabase function secret (`supabase secrets set`) **and** the Vault secret `ingest_cron_secret` (same value); GitHub secret of the same name for the deploy workflow | no |
| `ingest_function_url` | `http://host.docker.internal:54321/functions/v1/ingest` | Vault (SQL editor) | no |
| `EXPO_PUBLIC_API_ANON_KEY` (publishable/anon key) | `mobile/.env` from `supabase status` | EAS environment variable per profile | the *key* is public by design (RLS limits it to the read surface), but it is environment-specific → not committed |
| `EXPO_PUBLIC_API_URL` | `http://127.0.0.1:54321/rest/v1` | EAS environment variable per profile | no |
| `GOOGLE_MAPS_ANDROID_API_KEY` | `mobile/.env` (optional) | EAS environment variable (restricted key) | no |
| `EXPO_TOKEN` | – | GitHub secret | no |
| `SUPABASE_ACCESS_TOKEN` | – | GitHub secret | no |
| `SUPABASE_PROJECT_REF` | – | GitHub secret | no (not a credential, but keep it out of the tree anyway) |
| `SUPABASE_DB_PASSWORD` | `postgres` (local) | GitHub secret | no |
| Apple ASC API key (`.p8`, Key ID, Issuer ID) | – | uploaded to **EAS**, never to GitHub | no |
| Play service-account JSON | – | uploaded to **EAS** | no |
| `GOOGLE_MAPS_API_KEY` (thumbnails workflow, pre-existing) | – | GitHub secret | no |
| `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET` | – | reserved, unused in v1 (data-sources.md §5) | no |

## 2. What the client may see

`EXPO_PUBLIC_*` values are **inlined into the JS bundle** at build time: anyone
can extract them from the app. That is acceptable for exactly two things:

* the Supabase **publishable (anon) key** — it only grants the 8 read-only RPC
  functions, and RLS hides soft-deleted rows ([rls-review.md](rls-review.md));
* the API base URL and the restricted Maps Android key.

Everything else — the `service_role` key, the database password,
`INGEST_CRON_SECRET`, `SUPABASE_ACCESS_TOKEN` — must never appear in a bundle, a
screenshot, a log line or this repository. `service_role` **bypasses RLS**, so a
leak is a full data compromise: if it ever ships, rotate it in the dashboard and
redeploy.

## 3. GitHub Actions secrets (repository → Settings → Secrets and variables → Actions)

| Secret | Used by | Notes |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `supabase-deploy.yml` | dashboard → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | `supabase-deploy.yml` | the 20-char ref in the project URL |
| `SUPABASE_DB_PASSWORD` | `supabase-deploy.yml` | the database password set at project creation |
| `SUPABASE_DB_URL` | `ingest-health.yml`, `supabase-deploy.yml` (`cron-*`) | full connection string. Prefer the **session pooler** URI for IPv4-only runners; include `?sslmode=require` |
| `INGEST_CRON_SECRET` | `supabase-deploy.yml` (`secrets`) | 32+ random bytes; also goes into Vault |
| `INGEST_DATABASE_URL` | `ingest-run.yml` (run the worker from CI) | least-privilege login role, **not** the owner DSN — see below |
| `EXPO_TOKEN` | `eas-build.yml` | expo.dev → Account → Access tokens |

`INGEST_DATABASE_URL` is deliberately not the owner connection string. Create a
login role for the worker (architecture.md §8.3) and use its DSN:

```sql
-- SQL editor, once:
create role ingest_writer login password '<random>';
grant atlas_ingest to ingest_writer;      -- the ingestion surface only
-- no membership in service_role, no ownership of any table, RLS still applies
```

DSN: `postgresql://ingest_writer:<password>@<host>:5432/postgres?sslmode=require`
(the direct or session-pooler host). Rotate by `alter role ingest_writer password …`
and updating the GitHub secret.

Optional / pre-existing: `GOOGLE_MAPS_API_KEY` (thumbnails workflow only).

**Environment protection.** The `production` GitHub Environment (Settings →
Environments) must have required reviewers; every write job in
`supabase-deploy.yml` and the production/submit jobs in `eas-build.yml` target it,
so nothing reaches the hosted project or a store without a human approval click.

## 4. EAS environment variables (expo.dev → project → Environment variables)

Set per profile — `development`, `preview`, `preview-device`, `production`.
Non-secret values are pinned in `mobile/eas.json` (`env`); the environment-specific
ones are EAS environment variables so the same commit produces different builds:

| Variable | Type | Profiles |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | plaintext | all (`http://127.0.0.1:54321/rest/v1` locally, the project URL for preview/production) |
| `EXPO_PUBLIC_API_ANON_KEY` | **sensitive** | preview, preview-device, production |
| `GOOGLE_MAPS_ANDROID_API_KEY` | **sensitive** | preview, preview-device, production |
| `EXPO_PUBLIC_API_MODE` | plaintext (`real`) | pinned in `eas.json` |

`mobile/.env.example` is the development template and is committed (placeholders
only, never real values).

## 5. Rotation

| Leaked / expiring | Rotate where | Then |
|---|---|---|
| Supabase access token | dashboard → Account → Access Tokens (revoke + create) | update the GitHub secret; re-run `action: plan` to confirm |
| Database password | dashboard → Settings → Database → Reset password | update `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` |
| Anon key | dashboard → Settings → API → rotate | update EAS env vars, rebuild the apps |
| **service_role key** | dashboard → Settings → API → rotate | nothing else uses it; check the logs for misuse |
| `INGEST_CRON_SECRET` | new random value | `action: secrets` (function) **and** `select vault.update_secret((select id from vault.secrets where name='ingest_cron_secret'), '<new>');` |
| Expo token | expo.dev → Access tokens | update the GitHub secret |
| Apple ASC key | App Store Connect → Integrations → revoke + recreate | re-upload to EAS (`eas credentials`) |
| Play service account | Google Cloud → IAM → revoke the key | re-upload to EAS |
| Maps Android key | Google Cloud → Credentials → restrict/rotate | update the EAS env var, rebuild |

## 6. Guardrails in the repository

* `scripts/ci/secret_scan.py` — pattern scan of every tracked file, wired into CI
  as the `no-secrets` job. Run it locally before pushing:
  `python3 scripts/ci/secret_scan.py`.
* `.gitignore` ignores `.env` and `.env.*` at the root and in `mobile/`, with an
  explicit `!.env.example` exception so the placeholders stay reviewable.
* `supabase/functions/.env.example` and `mobile/.env.example` are the only
  committed environment templates.
* The deploy workflows print no secret: values are passed through `env:` and are
  masked by GitHub, and `supabase secrets set` is the only command that sees
  `INGEST_CRON_SECRET`.
