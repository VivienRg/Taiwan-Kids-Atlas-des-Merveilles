# Taiwan Places Harvest Pipeline

Harvests public activities / points-of-interest across Taiwan from open-data APIs,
normalizes them into one schema, dedupes across sources, and writes a single dataset.
The curated `data/activities.json` (the 87 hand-picked Zhongli-area entries) is left untouched.

## What it produces

- **`data/places.json`** — array of `Place` records (schema: `data/place.schema.json`).
- **`data/places.stats.json`** — counts by `type`, `audience`, `region`, and `tag`, so the
  data is easy to slice (tags / age / location) by consumers (web app, iOS app).

## Sources (merged + deduped)

1. **TDX Tourism API** (primary) — `Tourism/ScenicSpot`, `Tourism/Activity`, `Tourism/Restaurant`.
   Requires a **free** TDX account → OAuth2 `client_id` / `client_secret`.
   Register at <https://tdx.transportdata.tw/> → *Member Center → API Key*.
2. **data.gov.tw** (optional, config-driven) — supply direct JSON/CSV resource URLs.

Dedupe merges records when names are highly similar **and** within ~150 m (or exact name in
the same region). Merged records keep all `sources`, union their `categories`/`tags`/`pictures`,
and prefer a specific `audience` over `all`.

## Audience & age (explicit-only by design)

The source APIs have **no** age or kid/adult field. Per project decision, audience is set to
`kids` or `adults` **only when the text explicitly says so** (e.g. 親子/兒童 → kids,
酒吧/夜店/成人 → adults); everything else stays `all`. `age_range` is only added when an explicit
pattern like `3~12 歲` is found. Tune the keyword lists in `scripts/harvest/config.mjs`.

## Run it

> The hosted Claude sandbox has no outbound network, so run this in CI or locally.

### GitHub Actions (recommended)
1. Repo → **Settings → Secrets and variables → Actions**:
   - Secret `TDX_CLIENT_ID`, Secret `TDX_CLIENT_SECRET`.
   - (optional) Variable `DATAGOV_RESOURCES` = comma-separated `label|type|url` tuples,
     e.g. `poi|scenic_spot|https://.../resource.csv`.
2. Run the **Harvest Taiwan Places** workflow (manual `workflow_dispatch`, or the weekly cron).
   It harvests → validates against the schema → commits `data/places*.json`.

### Locally
```bash
export TDX_CLIENT_ID=...           # required
export TDX_CLIENT_SECRET=...       # required
export DATAGOV_RESOURCES="poi|scenic_spot|https://example/poi.csv"   # optional
npm run harvest
```

## Config knobs (`scripts/harvest/config.mjs`)

| Env var | Purpose | Default |
|---|---|---|
| `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET` | TDX OAuth2 credentials | — |
| `HARVEST_TDX` / `HARVEST_DATAGOV` | toggle a source (`false` to disable) | on |
| `TDX_PAGE_SIZE` / `TDX_DELAY_MS` / `TDX_MAX_PAGES` | paging behaviour | 300 / 250ms / 200 |
| `DATAGOV_RESOURCES` | `label|type|url` list | empty |
| `DEDUPE_NAME_SIM` / `DEDUPE_MAX_METERS` | dedupe thresholds | 0.85 / 150m |

## File map

```
scripts/harvest/
  config.mjs     sources, credentials, keyword maps, dedupe thresholds
  tdx.mjs        TDX OAuth2 + paged OData fetch
  datagov.mjs    generic data.gov.tw JSON/CSV fetch
  normalize.mjs  raw record -> Place; derive tags; explicit audience/age
  dedupe.mjs     Jaro-Winkler + Haversine merge across sources
  index.mjs      orchestrator -> data/places.json + data/places.stats.json
data/place.schema.json     output schema (validated in CI)
.github/workflows/harvest-places.yml
```

## Notes / limitations

- Names are mostly **zh-Hant** (the source language); `name_en` is populated only when a
  source provides it. Add a translation pass later if English names are needed.
- The iOS prompt (`docs/ios-app-generation-prompt.md`) can point its data layer at
  `places.json` instead of / in addition to `activities.json`; the `Place` schema is a superset.
