# Taiwan Kids Atlas — architecture

This document turns the existing Taiwan Kids Atlas des Merveilles web project into an iOS and Android app.
The app is backed by PostgreSQL (local Postgres in dev, Supabase in prod), and a scheduled job feeds it
from Taiwan open-data APIs.

Companion specs:

| Doc | Content |
|---|---|
| [data-sources.md](data-sources.md) | Every external API, verified live on 2026-11-02, with auth, params, licence and samples |
| [api-contract.md](api-contract.md) | What the mobile app calls; response types and real example responses |
| [ingestion.md](ingestion.md) | Cron, adapters, normalised row contract, retries, removals, monitoring |
| [adr/](adr/) | 0001 mobile stack · 0002 backend · 0003 data sources · 0004 ingestion runtime |
| [`supabase/migrations/`](../supabase/migrations/) | Schema, reference data, ingestion functions, public API, security, scheduling. **Implemented and verified.** |

## 1. Decisions at a glance

| Topic | Decision | ADR |
|---|---|---|
| Mobile | Expo SDK 55 (React Native, TS), Expo Router, TanStack Query (persisted), react-native-maps, expo-location, expo-image, i18next; EAS Build profiles development / preview / production; app in `/mobile` | [0001](adr/0001-mobile-stack-expo.md) |
| Backend | No custom server. PostgREST RPC over SQL functions in `public`; data in non-exposed schema `atlas`; RLS everywhere; PostGIS + pg_trgm | [0002](adr/0002-backend-supabase-postgrest.md) |
| Dev / prod parity | Supabase CLI locally (same images as prod); vanilla PostGIS + PostgREST also supported (CI) | [0002](adr/0002-backend-supabase-postgrest.md) |
| Data | Tourism Administration national attractions and events + Ministry of Culture family events + the original 87 curated activities. Taipei Travel API specified but **disabled** (Cloudflare challenge) | [0003](adr/0003-data-sources.md) |
| Ingestion | Deno TS core; Edge Function `ingest` triggered by pg_cron + pg_net in prod; `deno task ingest` CLI in dev; SQL functions own idempotent upserts and removals | [0004](adr/0004-ingestion-runtime.md) |
| Languages | Content stored as i18n JSON (`zh-Hant`, `en`, `ja`, `ko`, `zh-Hans`) with server-side fallback; UI locales en + zh-Hant | api-contract §2 |

## 2. What exists today (repo audit, 2026-11-02)

Repo: `git@github.com:VivienRg/Taiwan-Kids-Atlas-des-Merveilles.git`, branch `main`.
It is published as a GitHub Pages site at `tw.kidsatlas.roggero.io` (`CNAME`).

### 2.1 Static web app (committed)

- **Stack:** plain HTML, CSS and JS. No build step and no framework.
- **Pages:**
  - `index.html`: splash screen showing the logo and "Taiwan Kids Atlas des Merveilles", which redirects
    to `index2.html` after 3 s.
  - `index2.html`: a 1,420-line mobile-first single-page app with inline JS. It loads
    `./data/activities.json` at runtime.
  - `assets/app.js`: an older renderer with sort helpers and a fallback map thumbnail.
- **UI concepts to keep:**
  - Tab bar with Home, Events and Activities.
  - Home dashboard: activity and event counts, top-categories chart, tag cloud, disclaimer, and an About
    card with copyright, last update (via the GitHub commits API) and version.
  - Activities list:
    - horizontal category chips;
    - a search box ("Search activities by names, location, tags, categories…");
    - a filter overlay with category, region, age min/max, dog-friendly, food nearby, stroller-friendly,
      seasonal, price buckets (Free/$/$$/$$$) and free-form tags;
    - cards showing the thumbnail, a first-category badge and an indoor/outdoor badge;
    - an embedded Google Maps preview.
  - Events tab with chips.
  - Empty state: "No activities found matching your filters" with a reset button.
- **Data:**
  - `data/activities.json`: **87 curated activities** following `data/activity.schema.json`.
    - Fields: id, name, region, city, district, indoor_outdoor, categories, tags, cost_range, age_range,
      natural, desc, website, map_link, drive_min, address_en, address_query.
    - Cities: Taoyuan 42, Hsinchu 20, Taipei 12, New Taipei 11, Miaoli 1, Yilan 1.
    - Mostly ages 3–14.
    - No coordinates. `drive_min` is measured from Zhongli: the README says coverage is "a 1-hour range
      around Zhongli".
  - `data/categories.txt` (52 categories), `data/tags.txt`.
  - `data/event.schema.json`: events with shows; English; status and venue per show.
  - `data/events_kids.json`: empty now. Git history shows an automated job committed 70 English kids
    events from it in August 2025 (commit `85bbbf9`).
  - `thumbnails/*.png`: fetched from Google Places by a workflow that needs `GOOGLE_MAPS_API_KEY`.
- **Community pipeline (GitHub Actions):**
  - The issue form `add_activity.yml` feeds `issue-to-pr.yml`, which converts the issue to JSON with fuzzy
    dedupe and opens a PR.
  - `validate-json.yml` validates against the schema. It reads `data/activities_seed.json`, which does not
    exist in the repo, so it would fail as written.
  - `generate-thumbnails.yml` refreshes thumbnails.
- **Audience and tone:** families with young children (ages 0–14), discovering kid-friendly outings near
  home, in a friendly tone with emoji categories. Author: Vivien Roggero. MIT licence (README).
- **Languages:**
  - The UI is **English only** (`<html lang="en">`).
  - Some names carry Traditional Chinese in parentheses ("Hutoushan Park (虎頭山)").
  - The product name is partly French ("des Merveilles").
  - The data sources this design adds are zh-Hant, so the app supports **en + zh-Hant**.

### 2.2 React Native prototype (untracked, not committed)

- `RN_MIGRATION_PLAN.md`: plan for an Expo migration, with a data model and component mapping.
- `TaiwanKidsAtlas/`: Expo SDK ~55.0.6, RN 0.83.2, React 19.2, React Navigation 7 native-stack, AsyncStorage.
  - Screens: Home, ActivityDetail, Favorites.
  - Components: ActivityCard, Chip, FilterModal, Header, SearchBar.
  - Constants: theme tokens, `SEASONAL_EVENTS`, `FEATURES` (emoji feature tags), and a bundled copy of
    `activities.json`.
  - `app.json`: name "Taiwan Kids Atlas", bundle and package `com.taiwankidsatlas.app`, splash `#F6F9FC`.
  - It contains a prebuilt `ios/` folder.
  - Bug: `getThumbnailUri` points at a different GitHub user (`vivienlee00/Taiwan-Kids-Atlas`).
- The root `package.json`, `package-lock.json` and `tsconfig.json` have uncommitted Expo additions that
  belong to the prototype. The mobile card reverts them.

### 2.3 What carries over

| Existing | Becomes |
|---|---|
| 87 curated activities and their English copy | `curated` source (kid_score 100, age ranges, English names), linked to official records for coordinates and images |
| Category vocabulary (52) | 19 place categories + 10 event categories with emoji. 51 originals mapped in `category_mappings` (source `curated`); `Seasonal` becomes the `seasonal` kid_tag |
| Tags and `FEATURES` | `kid_tags` vocabulary (api-contract §5.1) |
| cost_range buckets / $ filters | `price_level` 0–3 |
| region/city filter, age filter, indoor/outdoor | `city`/`district` filters (`areas_list`), `age_min`/`age_max`, `indoor_outdoor` |
| Theme tokens, splash, icons | Reused by `/mobile` (ADR-0001) |
| Static site and community issue flow | Untouched. They keep working on GitHub Pages. New curated records reach the app through the `curated` import. |

## 3. Target architecture

```
                         Taiwan open data (no keys)
   media.taiwan.net.tw (觀光署 zip, daily)      cloud.culture.tw (文化部 親子 JSON)      [travel.taipei — disabled]
                    │                                      │
                    ▼                                      ▼
   ┌──────────────────────── Ingestion worker (Deno TS, one core) ─────────────────────────┐
   │  prod: Supabase Edge Function "ingest"  ◄── pg_net POST ◄── pg_cron (atlas.sources)    │
   │  dev : deno task ingest --source … | --all                                              │
   │  adapters: fetch (ETag, retry/backoff) → parse → normalise (kid score, keywords)        │
   └───────────────────────────────┬────────────────────────────────────────────────────────┘
                                   │ select atlas.start_run / upsert_places / upsert_events / finish_run
                                   ▼
   ┌──────────────── PostgreSQL 15+/17 (Supabase in prod, Supabase CLI or PostGIS locally) ────┐
   │ schema atlas (not exposed): sources, admin_areas, categories, category_mappings,          │
   │   places, events, event_occurrences, ingestion_runs, ingestion_errors, view source_health │
   │ schema public: places_search, place_detail, places_map, events_search, event_detail,      │
   │   categories_list, areas_list, app_meta   (STABLE, SECURITY INVOKER, RLS-filtered)         │
   └───────────────────────────────┬────────────────────────────────────────────────────────────┘
                                   │ PostgREST (Supabase API gateway in prod)  GET /rest/v1/rpc/…
                                   ▼
   ┌───────────────────────── Expo app (/mobile, iOS + Android via EAS) ───────────────────────┐
   │ Expo Router tabs: Discover · Explore · Map · Events · Favorites · Settings                │
   │ TanStack Query + AsyncStorage persistence (offline) · favourites local · i18n en/zh-Hant  │
   └───────────────────────────────────────────────────────────────────────────────────────────┘
```

## 4. Repository layout (decided)

```
/                      static GitHub Pages site (unchanged): index*.html, assets/, data/, thumbnails/
/docs                  this spec set; api/examples (real responses); data-sources/examples (raw feed samples);
                       ingestion/prototypes (reference jq normalisers); ingestion/normalized-examples
/supabase              Supabase CLI project
  config.toml          created with `supabase init` (backend card); set [functions.ingest] verify_jwt = false
  migrations/          7 migrations (this task) — the DB contract
  seed.sql             dev sample data (backend card)
  functions/           Edge Function `ingest` + shared Deno ingest core + tests (backend card)
/data/curated_links.json   curated id → TA AttractionID links (backend card; start from docs/ingestion/prototypes/curated_links.sample.json)
/mobile                Expo app (mobile card)
/docker-compose.yml    optional vanilla stack: imresamu/postgis:17-3.5 + postgrest/postgrest:v12.2.3 (backend card, for CI)
```

Branches: each implementation card works on its own branch or worktree (`feat/backend-ingestion`,
`feat/mobile-app`) and merges to `main` after QA.

## 5. Data model

The full DDL is in migration 0200. Key points:

- **Multilingual text** is `jsonb` keyed by BCP-47 tag (`{"zh-Hant": "…", "en": "…"}`). Missing languages
  are omitted, never stored as empty strings. `atlas.t(obj, lang)` and `atlas.pick_lang(obj, lang)`
  implement the fallback (requested → zh family → en → zh-Hant → any).
- **places**:
  - Upsert key `unique (source, source_id)`. The surrogate id is a `uuid` that stays stable for the life of
    the record.
  - Columns: name, alt_names, description, address, `city_code`/`district_code` → `admin_areas`,
    `location geography(point,4326)` with a GiST index, phone and URLs, `source_categories` (raw codes),
    `category_slugs` (mapped, GIN), `tags`, `kid_tags`, `kid_score` 0–100, `is_kid_friendly` (generated,
    ≥50), age range, indoor_outdoor, `is_free`, `price_level`, `fee_text`, `opening_hours` (normalised
    periods) and `opening_hours_text`, `facilities`, `images` (jsonb array), `service_status`.
  - Bookkeeping: `raw` (original record), `content_hash`, `first_seen_at`, `last_seen_at`,
    `last_seen_run_id`, `removed_at` (soft delete), `linked_place_id` (curated → official),
    `duplicate_of` + `duplicate_reason` (`curated_link` | `auto_dedupe` | `manual`), and a generated
    trigram `search_text`.
- **events** + **event_occurrences**:
  - Events use the same key, i18n, kid and bookkeeping columns as places. They also hold a summary
    `starts_at`/`ends_at`, `status`, price and organizer text, and a primary venue.
  - Each dated show is one occurrence with venue, address, area and location. Search and filters run on
    occurrences.
- **categories**: slug, i18n name, emoji, `applies_to` (place/event), sort.
  **category_mappings**: (source, source_code) → slug, many-to-many. Seeded for Tourism Administration
  class codes, Ministry of Culture categories, 51 of the original 52 curated categories (`Seasonal` is a kid_tag), and `kw:<slug>` name
  keywords.
- **admin_areas**: Ministry of the Interior (MOI) city codes (22 seeded, with en names) and 8-digit
  district codes. Districts are registered by ingestion. English names are seeded for Taoyuan, Taipei and
  Hsinchu City districts.
- **sources**: one row per feed, holding publisher, licence, attribution (i18n), `enabled`, `schedule_cron`,
  `min_keep_ratio`, adapter `config`, and HTTP cache validators.
- **ingestion_runs** (status, counters, error class, details; one running run per source) and
  **ingestion_errors** (per-record or per-stage errors, capped at 500 per run).
- **Kid-friendliness** is a score, not a boolean flag in the source data. Curated rows are 100, the
  Ministry of Culture family feed is 80, and Tourism Administration records use the heuristic rules v1
  (ingestion.md §4.4). The API's `kid_friendly=true` filter means score ≥ 50.

## 6. Environments

| | Local dev (default) | Local dev (vanilla / CI) | Prod |
|---|---|---|---|
| DB | `supabase start` (Postgres 17 + PostGIS, pg_cron, pg_net, Vault) | `imresamu/postgis:17-3.5` | Supabase project (region: ap-northeast-1 Tokyo or ap-southeast-1 Singapore, nearest to Taiwan; owner decision) |
| Migrations | `supabase db reset` | `psql -f supabase/migrations/*.sql` in order | `supabase db push` (devops card, human-approved) |
| API | `http://127.0.0.1:54321/rest/v1` | `postgrest/postgrest:v12.2.3` → `http://localhost:3000` | `https://<ref>.supabase.co/rest/v1` |
| Ingestion | `deno task ingest …` or `supabase functions serve ingest` + pg_cron | `deno task ingest …` | Edge Function `ingest` + pg_cron (enabled by runbook) |
| App | `EXPO_PUBLIC_API_URL` → local (simulator: 127.0.0.1; Android emulator: 10.0.2.2) | same | EAS env per profile |

**arm64 note:** the official `postgis/postgis` image has no arm64 manifest (pull fails on Apple Silicon).
Use `imresamu/postgis` or the Supabase CLI.

## 7. Security model

- Public read through PostgREST functions only. Tables are in `atlas`, which is not exposed.
- RLS is on for every `atlas` table.
  - `anon` and `authenticated` see active places and events, categories and areas, and a column subset
    of `sources`. They cannot see `ingestion_*`, `category_mappings` or `sources.config`.
  - `atlas_ingest`, `service_role` and `postgres` can write.
- `EXECUTE` is revoked from `PUBLIC` on every `atlas.*` function.
  - `anon` may run only `atlas.t`, `pick_lang`, `norm_zh` and the 8 public API functions.
  - Scheduling functions (`invoke_ingest`, `sync_cron_schedules`, `unschedule_all`) are `service_role`
    only, and `SECURITY DEFINER`.
- The anon (publishable) key ships in the app. That is fine because it only grants the read surface above.
  The service-role key, DB password, `INGEST_CRON_SECRET` and Vault values never reach the client or the repo.
- The Edge Function `ingest` runs with JWT verification off and requires `Authorization: Bearer
  $INGEST_CRON_SECRET`, compared in constant time.
- Location privacy: the device sends coordinates only as query params, and the server never stores them.
  Favourites stay on the device.

## 8. Configuration and secrets

All configuration comes from environment variables. Commit `.env.example` files with placeholders. The
`.gitignore` already ignores `.env` and `.env.*`; add `!.env.example` so the examples can be committed.

### 8.1 Mobile (`/mobile/.env.example`, EAS environment variables per profile)

| Var | dev | preview | production | Secret? |
|---|---|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | `development` | `preview` | `production` | no |
| `EXPO_PUBLIC_API_URL` | `http://127.0.0.1:54321/rest/v1` | prod or staging URL | `https://<ref>.supabase.co/rest/v1` | no |
| `EXPO_PUBLIC_API_ANON_KEY` | local anon key from `supabase status` | project anon key | project anon key | no (public by design) |
| `EXPO_PUBLIC_API_MODE` | `live` or `mock` | `live` | `live` | no |
| `GOOGLE_MAPS_ANDROID_API_KEY` | optional (blank map without it) | required | required | restricted key; EAS secret |
| `EXPO_TOKEN` | – | CI only | CI only | **yes** (GitHub Actions secret) |

`app.config.ts` reads `GOOGLE_MAPS_ANDROID_API_KEY` into `android.config.googleMaps.apiKey`.
`EXPO_PUBLIC_*` values are inlined into the bundle at build time.

### 8.2 Ingestion worker (`supabase/functions/.env.example`)

| Var | Local | Prod (where set) | Secret? |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (Supabase CLI) or the vanilla DSN | GH Actions fallback only | **yes** in prod |
| `SUPABASE_DB_URL` | provided by `functions serve` | provided automatically to Edge Functions | yes (platform-managed) |
| `INGEST_CRON_SECRET` | any dev string | `supabase secrets set` (and the same value in Vault `ingest_cron_secret`) | **yes** |
| `INGEST_SOURCES` | optional comma list restricting `--all` | – | no |
| `INGEST_DEADLINE_MS` | `600000` | `120000` | no |
| `INGEST_USER_AGENT` | default from ingestion.md §6 | same | no |
| `INGEST_LOG_LEVEL` | `debug` | `info` | no |
| `TDX_CLIENT_ID`, `TDX_CLIENT_SECRET` | reserved (unused in v1) | reserved | yes |

### 8.3 Database (Vault, per environment; never in migrations)

| Vault secret | Value |
|---|---|
| `ingest_function_url` | `https://<ref>.supabase.co/functions/v1/ingest` (prod), `http://host.docker.internal:54321/functions/v1/ingest` (local) |
| `ingest_cron_secret` | same value as `INGEST_CRON_SECRET` |

Optional least-privilege login for the GitHub Actions fallback:
`create role ingest_writer login password '<secret>' in role atlas_ingest;`. Its DSN then becomes
`DATABASE_URL`.

### 8.4 CI / deploy (devops card; GitHub Actions secrets)

| Secret | Use |
|---|---|
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | `supabase link`, `db push`, `functions deploy`, `secrets set` |
| `EXPO_TOKEN` | EAS Build / Submit |
| Apple: App Store Connect API key (issuer id, key id, .p8) | EAS Submit iOS |
| Google: Play service-account JSON | EAS Submit Android |
| `GOOGLE_MAPS_API_KEY` (existing) | existing thumbnails workflow only |

## 9. Parallel implementation plan

The interface between the two implementation cards is **api-contract.md plus `docs/api/examples/`**. It is
frozen at v1.0, and changes must be additive.

| Card | Builds from | Done when |
|---|---|---|
| Backend + ingestion (`t_ee46f21c`) | migrations (done), ingestion.md, data-sources.md, ADR-0002/0004 | `supabase init` + config; seed.sql; Deno core + adapters (TA attractions, TA events, MOC, curated) + Edge Function + CLI; `data/curated_links.json` covering as many of the 87 as possible; tests per ingestion.md §9; README section |
| Mobile (`t_5dedceae`) | api-contract.md, examples (mock mode), ADR-0001, §2 of this doc | `/mobile` app per ADR-0001; screens Discover, Explore, Map, Detail, Events, Favorites, Settings; offline cache; en/zh-Hant; attribution display (api-contract §7); tests; README |
| DevOps (`t_a4249ad3`) | §6–8 of this doc, ingestion.md §2/§8, ADR-0004 | CI with Postgres + migrations, EAS profiles, Supabase deploy workflow, runbook including Vault + `sync_cron_schedules()`, alert wiring on `atlas.source_health` |
| QA (`t_0d703d46`) | everything above | Note: the disabled Taipei Travel source is a documented external blocker, not a defect (ADR-0003) |

## 10. Risks and open questions

| # | Risk / question | Mitigation / owner |
|---|---|---|
| R1 | Taipei Travel API blocked by Cloudflare challenge | Disabled source; national DB covers Taipei. **Human:** request an allow-list from 臺北市政府觀光傳播局, or accept dropping it (ADR-0003) |
| R2 | English content is thin (official data is zh-Hant only) | UI handles mixed languages; curated English; a future translation pipeline is a follow-up |
| R3 | Category and kid heuristics are noisy (class codes misused) | Keyword categories; curated links override; heuristics are versioned (`KID_RULES_VERSION`) and tunable with golden tests |
| R4 | Edge Function limits on the 16 MB attractions JSON | Measure during implementation; GitHub Actions CLI fallback (ADR-0004) |
| R5 | Feed URL or format changes (media.taiwan.net.tw v2.0 paths) | `parse` errors are classified and alerted; the removal guard prevents mass deletion; TDX is the alternate path |
| R6 | Hot-linked third-party images may disappear | Placeholder by category; images refresh daily from the feed |
| R7 | App identifier `com.taiwankidsatlas.app` cannot change after store publish | **Owner** confirms before first upload |
| R8 | Supabase region choice (latency from Taiwan) | **Owner**: Tokyo or Singapore |
| R9 | `validate-json.yml` references a missing `data/activities_seed.json` | Pre-existing. Out of scope; flag to the owner |
| R10 | README declares MIT and links a `LICENSE` file that does not exist; the `curated` source is labelled MIT | **Owner** adds `LICENSE` (or changes the declared licence and `atlas.sources.license` for `curated`) |
