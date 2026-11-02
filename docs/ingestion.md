# Ingestion design

How Taiwan open data gets into Postgres: on a schedule, idempotently and with an audit trail.
The SQL side is already implemented and verified in
[`20261102000400_ingest_functions.sql`](../supabase/migrations/20261102000400_ingest_functions.sql) and
[`20261102000700_scheduling.sql`](../supabase/migrations/20261102000700_scheduling.sql). This document
specifies the TypeScript worker that the backend card implements.
Decisions: [ADR-0004](adr/0004-ingestion-runtime.md). Sources: [data-sources.md](data-sources.md).

## 1. Where it runs

```
                      ┌──────────────── prod (Supabase) ─────────────────┐
 pg_cron job per ───► │ atlas.invoke_ingest(src) ─pg_net POST──► Edge Function "ingest"       │
 source (UTC cron)    │   (Vault: ingest_function_url, ingest_cron_secret)    │ 202 + background task │
                      │                                                       ▼                    │
                      │            ingest core (Deno TS) ── fetch ──► media.taiwan.net.tw, cloud.culture.tw
                      │                         └── SQL (postgres.js) ──► atlas.start_run / upsert_* / finish_run
                      └───────────────────────────────────────────────────────────────────────────┘
 dev:  deno task ingest --source <id> | --all       (same core, DATABASE_URL → local Postgres)
 dev (prod-like): supabase start + supabase functions serve ingest + vault secrets + sync_cron_schedules()
 fallback: GitHub Actions scheduled workflow running the same CLI (only if Edge limits are hit, ADR-0004)
```

The core module is the same in every mode. Only the entrypoint differs:

| Entrypoint | File | Used by |
|---|---|---|
| Edge Function | `supabase/functions/ingest/index.ts` | pg_cron (prod, local Supabase) and manual `curl` |
| CLI | `supabase/functions/_shared/ingest/cli.ts`, run with `deno task ingest` | developers, CI integration tests, docker cron, GH Actions fallback |

## 2. Schedule

Times are stored in `atlas.sources.schedule_cron`. pg_cron runs in UTC.

| Source | Cron (UTC) | Asia/Taipei | Rationale |
|---|---|---|---|
| `tw_tourism_attractions` | `15 8,14 * * *` | 16:15 and 22:15 daily | Files regenerate around 14:30 Taipei (`Last-Modified 06:30 GMT`). The second run is a free retry: it gets a 304 if the first succeeded. |
| `tw_tourism_events` | `25 8,14 * * *` | 16:25 and 22:25 | Same file family |
| `moc_kids_events` | `40 8,14 * * *` | 16:40 and 22:40 | No ETag, so both runs are full and idempotent (58 rows) |
| `taipei_travel_*` | `0 9 * * 1` / `10 9 * * 1` | Mon 17:00 / 17:10 | **Disabled** (`enabled = false`) |
| `curated` | none | – | Imported on demand when `data/activities.json` or `data/curated_links.json` changes (CLI or CI) |
| housekeeping `atlas.purge()` | `30 19 * * 0` | Mon 03:30 | Hard-deletes rows removed more than 90 days ago, events that ended more than 180 days ago, and runs older than 180 days |

To change a schedule or enable a source:

```sql
update atlas.sources set schedule_cron = '0 7 * * *', enabled = true where id = 'moc_kids_events';
select atlas.sync_cron_schedules();   -- (re)creates cron jobs from atlas.sources; returns job names
select atlas.unschedule_all();        -- pause switch / rollback
```

The migrations **never schedule anything**. Enabling the cron is a deliberate operator step in the release runbook.

## 3. Run lifecycle

```ts
// pseudo-code of core.runSource(sourceId, trigger)
const src = await db.one`select * from atlas.sources where id = ${sourceId}`;   // config, etag, enabled
if (!src.enabled && trigger === 'cron') return;                             // disabled sources never auto-run
const runId = await db`select atlas.start_run(${sourceId}, ${trigger}, ${CODE_VERSION})`;
//   ↳ SQLSTATE 55P03 = a run is already in progress → log "skip: locked" and exit 0 (HTTP 409 from the function)
try {
  const res = await fetchWithRetry(adapter.request(src), { etag: src.http_etag, lastModified: src.http_last_modified });
  if (res.status === 304) return finish(runId, 'skipped', { http_requests: n }, null, null, { http: { status: 304 } });
  const records = adapter.parse(res);                        // throws ParseError → error_class 'parse'
  if (records.length === 0) throw new ValidationError('empty feed');   // never treat an empty feed as "all removed"
  const { rows, rejected } = adapter.normalize(records);     // per-record try/catch; rejected → log_ingestion_error
  for (const batch of chunk(rows, src.config.batch_size ?? 500)) {
    await withDbRetry(() => db`select atlas.${adapter.kind === 'place' ? 'upsert_places' : 'upsert_events'}(${runId}, ${batch}::jsonb)`);
    if (deadlineExceeded()) return finish(runId, 'partial', counters, 'timeout', 'deadline reached', details);
  }
  const status = rejected.length > 0.05 * records.length ? 'partial' : 'succeeded';
  return finish(runId, status, { http_requests, records_fetched: records.length, records_failed: rejected.length },
                status === 'partial' ? 'validation' : null, null, { http: { etag: res.etag, last_modified: res.lastModified } });
} catch (e) {
  await db`select atlas.log_ingestion_error(${runId}, ${e.stage}, null, ${e.message}, ${e.context})`;
  return finish(runId, 'failed', counters, e.errorClass ?? 'unknown', e.message, {});
}
```

What the database does (already implemented):

- `start_run` refuses a second concurrent run per source through a unique partial index. Runs stuck in
  `running` for over 2 h become `abandoned`.
- `upsert_*` dedupes the batch by `source_id` (last one wins) and rejects and logs invalid rows. It resolves
  city and district (code, zh-Hant name with 台/臺 tolerance, or English name), maps categories, computes the
  content hash, inserts new rows, updates changed rows, touches unchanged rows, and increments the run counters.
- `finish_run` soft-deletes rows the snapshot no longer contains, but only on `succeeded`, only for full
  snapshot sources, and only if the removal guard passes. It writes final counters and status, stores the
  ETag and Last-Modified on success, then for place sources runs `refresh_linked_places()` and
  `dedupe_places()`.

## 4. Normalised row contract

The worker sends JSON arrays of these rows. They are verified against the SQL functions with the real feeds
(§10). Real examples: [`ingestion/normalized-examples/`](ingestion/normalized-examples/).
**Reference normalisers** in jq, used for the verification run, are in
[`ingestion/prototypes/`](ingestion/prototypes/). The TS implementation must produce the same output for the
sample inputs. Use them as golden tests.

```ts
type I18n = Partial<Record<'zh-Hant' | 'en' | 'ja' | 'ko' | 'zh-Hans', string>>; // omit empty languages
interface ImageIn { url: string /* https only */; caption?: I18n; credit?: string | null }

interface NormalizedPlace {
  source_id: string;                 // REQUIRED, stable id from the source (upsert key with source)
  name: I18n;                        // REQUIRED, at least one non-blank language
  alt_names?: string[];
  description?: I18n; address?: I18n; postal_code?: string | null;
  city_code?: string | null;  city_name?: string | null;      // code preferred; name (zh or en) as fallback
  district_code?: string | null; district_name?: string | null; // 8-digit code registers the district
  lat?: number | string | null; lng?: number | string | null; // WGS84; outside Taiwan box → dropped by DB
  phone?: string | null; website_url?: string | null; booking_url?: string | null; source_url?: string | null;
  source_categories?: string[];      // raw codes (+ "kw:<slug>" keyword codes); mapped in SQL
  tags?: string[];                   // raw source tags
  kid_tags?: string[];               // api-contract §5.1 vocabulary only
  kid_score?: number;                // 0..100, see §4.4
  age_min?: number | null; age_max?: number | null;          // 0..18
  indoor_outdoor?: 'indoor' | 'outdoor' | 'mixed' | null;
  is_free?: boolean | null; price_level?: 0 | 1 | 2 | 3 | null; fee_text?: I18n;
  opening_hours?: { periods: Array<{ days: string[]; opens: string; closes: string; label?: I18n;
                                      valid_from?: string | null; valid_to?: string | null }> } | null;
  opening_hours_text?: I18n;
  facilities?: string[];             // FacilityEnum codes as strings
  images?: ImageIn[];
  service_status?: 'open' | 'temporarily_closed' | 'permanently_closed' | 'unknown';
  linked?: { source: string; source_id: string } | null;     // curated only (§4.3)
  source_updated_at?: string | null; // ISO-8601 with offset
  raw?: unknown;                     // original record, stored for re-processing; excluded from content hash
}

interface NormalizedOccurrence {
  starts_at: string;                 // REQUIRED ISO-8601 with offset (+08:00 for local Taiwan times)
  ends_at?: string | null;
  venue_name?: I18n; address?: I18n;
  city_code?: string | null; city_name?: string | null; district_code?: string | null; district_name?: string | null;
  lat?: number | string | null; lng?: number | string | null;
  price_text?: I18n; ticket_url?: string | null;
}

interface NormalizedEvent {
  source_id: string; name: I18n;     // REQUIRED
  occurrences: NormalizedOccurrence[];   // REQUIRED, ≥1. Replaced wholesale whenever the event changes
  description?: I18n; source_categories?: string[]; tags?: string[]; kid_tags?: string[]; kid_score?: number;
  age_min?: number | null; age_max?: number | null;
  status?: 'scheduled' | 'cancelled' | 'postponed' | 'rescheduled';
  is_free?: boolean | null; price_text?: I18n; organizer?: I18n;
  website_url?: string | null; ticket_url?: string | null; source_url?: string | null; images?: ImageIn[];
  venue_name?: I18n; address?: I18n;  // default: first occurrence's
  city_code?: string | null; city_name?: string | null; district_code?: string | null; district_name?: string | null;
  lat?: number | string | null; lng?: number | string | null;
  source_updated_at?: string | null; raw?: unknown;
}
```

General rules:

- Never emit empty strings. Omit the key or use `null`.
- Trim whitespace.
- Keep only `https://` image URLs.
- Arrays must be arrays, never null.
- **Determinism matters.** The content hash is computed from the row minus `raw`, so key order inside
  arrays must be stable between runs (sort `kid_tags`; keep source order for images). Otherwise every run
  reports every row as updated.

### 4.1 `tw_tourism_attractions` adapter

1. Send a conditional GET of `config.url` with `If-None-Match` and `If-Modified-Since` taken from `atlas.sources`.
2. Unzip in memory (`npm:fflate`). Read the members named in `config` and strip the BOM.
3. Join `AttractionServiceTimeList` and `AttractionFeeList` by `AttractionID`.
4. Map the fields as listed in [data-sources.md §1](data-sources.md#field-mapping--normalizedplace-see-ingestionmd-41).
5. Reference implementation: [`prototypes/ta_attractions.jq`](ingestion/prototypes/ta_attractions.jq).

### 4.2 `tw_tourism_events` adapter

Use the same download, unzip and BOM handling as §4.1 with `EventList.json`. Each record becomes one
occurrence. Reference: [`prototypes/ta_events.jq`](ingestion/prototypes/ta_events.jq).
Kid score: class `204` → 70, plus `親子|兒童|孩童|小朋友|幼兒|寶寶` in name or description → 50, plus
`DIY|手作|體驗|闖關|童玩` → 10. Cap at 100. On 2026-11-02 this gave 154 of 1,173 events ≥ 50.

### 4.3 `curated` import (CLI only)

Input: `data/activities.json` (87 records) plus `data/curated_links.json`. The links file is new and
created by the backend card; it maps a curated id to a `tw_tourism_attractions` `AttractionID`.
Start from [`prototypes/curated_links.sample.json`](ingestion/prototypes/curated_links.sample.json), which
holds 5 verified links. Reference: [`prototypes/curated.jq`](ingestion/prototypes/curated.jq).

- `name`: `"Hutoushan Park (虎頭山)"` → `{en: "Hutoushan Park", "zh-Hant": "虎頭山"}`. Only parenthesised
  text that contains Han characters becomes zh-Hant.
- `description.en` = `desc`, `address.en` = `address_en`.
- `city_name` and `district_name` are the English names. The DB resolves them where they are unambiguous.
  "Hsinchu" alone is ambiguous between city and county and stays null unless linked.
- `kid_score` = 100. `age_min` and `age_max` come from `age_range`. `indoor_outdoor` is lower-cased.
- `price_level`: `0` → 0, `1–200` → 1, `200–600` → 2, `600+` → 3.
- `kid_tags` = `family` plus the mapped original tags (`AC` → `air_con`, `dog friendly` → `dog_friendly`,
  `stroller` → `stroller_friendly`, `waterplay`/`splash`/`pool` → `water_play`, `creative`/`DIY`/`ceramics`
  → `diy`, …), plus indoor/outdoor, plus `free`.
- `linked` = `{source: 'tw_tourism_attractions', source_id}` when a link exists. `refresh_linked_places()`
  then copies coordinates, district, images, the zh-Hant name and description, and hours into the curated
  row (curated values win), and hides the official twin.
- Unlinked curated rows have no coordinates: they show in lists but not on the map or in near-me.
  **Backend card task:** link as many of the 87 as possible. Use a pg_trgm name match within the same
  city, then review by hand. Geocode the rest from `address_en`. If you use OSM Nominatim, send at most
  1 request/s with a contact User-Agent, cache the results in `data/curated_geocode_cache.json`, and pass
  them as `lat`/`lng`.
- The curated source is a full snapshot: deleting a record from `activities.json` soft-deletes it.

### 4.4 Kid-friendliness score (rules v1, `KID_RULES_VERSION = 1`)

For `tw_tourism_attractions`, compute `kid_score = clamp(0, 100, base + Σ signals)`, and set it to 0 if
`ServiceStatus = 0`. A place is kid-friendly when `kid_score ≥ 50` (a generated column in the DB).

| Signal | Points | kid_tag |
|---|---|---|
| base = max class weight: 26 → 60, 20 → 60, 25/27/14/9/15 → 40, 19/17 → 30, 24/16/13/12 → 20, else 0 | base | 26 → `animals`, 20 → `rides`, 25 → `learning`, 2/7/8/11/16/18 → `nature` |
| name matches `動物園|水族館|樂園|兒童|親子|博物館|科學館|科教館|天文館|圖書館|農場|牧場|觀光工廠` | +30 | – |
| name, description or tags match `親子|兒童|孩童|小朋友|幼兒|寶寶` | +30 | `family` |
| … match `遊戲場|遊樂場|溜滑梯|共融|遊具|沙坑` | +30 | `playground` |
| … match `戲水|玩水|親水` | +15 | `water_play` |
| … match `動物|水族|昆蟲|蝴蝶` | +10 | `animals` |
| … match `DIY|手作|體驗` | +10 | `diy` |
| … match `科學|科技|天文|恐龍|探索` | +10 | `learning` |
| facility `3` (nursing room) | +20 | `nursing_room` |
| facility `56` (stroller rental) | +15 | `stroller_friendly` |
| … match `酒吧|夜店|酒莊|酒廠|賭場|情趣` | −60 | – |
| `IsAccessibleForFree = 1`, or every fee is 0 | 0 | `free` |

Outcome on the 2026-11-02 file: **872 of 6,205** attractions score ≥ 50 (788 remain visible after duplicate hiding). Golden test vectors from the
reference normaliser (verified against its output):

| AttractionID | Name | Classes | Expected `kid_score` | Expected `kid_tags` |
|---|---|---|---|---|
| Attraction_379000000A_000351 | 臺北市立兒童新樂園 | 6,12,20,27 | 100 | diy, family, learning, playground, rides |
| Attraction_376440000A_000038 | 六福村主題遊樂園 | 20 | 100 | animals, rides |
| Attraction_376430000A_001634 | 巧虎夢想樂園 | 12,18 | 80 | family, nature |
| Attraction_376430000A_001576 | Xpark 八景島水族館 | 12,18 | 70 | animals, diy, nature |
| Attraction_345040000G_000001 | 太平山國家森林遊樂區 | 16 | 30 | animals, nature |
| Attraction_376430000A_000347 | 小人國 | 12 | 20 | – |
| (金門酒廠, class 14) | | 14 | 0 | – |

小人國 scoring 20 shows the heuristic's limits. The curated layer fixes it: `window-on-china-theme-park`
links to this record, and the record is hidden behind the curated entry. Other sources: `moc_kids_events`
uses a flat 80 with tag `family` (the whole feed is the 親子 category). `curated` uses 100.
`taipei_travel_attractions` (if enabled) adds +50 when `target[].name` contains `親子`, and +20 when
`friendly[]` mentions 哺乳 or 哺集乳.

### 4.5 Name-keyword categories

Because class codes are noisy (data-sources.md §1), the attraction normaliser also emits `kw:<slug>` codes
from the **name** only. Migration 0300 maps every `kw:<slug>` to `<slug>`:

| slug | name regex |
|---|---|
| animals | `動物園|水族館|海洋館|昆蟲館|蝴蝶園|鳥園|牧場` |
| museum | `博物館|美術館|文物館|紀念館|藝術館|展示館|文化館` |
| science | `科學|科教館|天文|探索館|教育館|自然教育中心` |
| library | `圖書館|書店` |
| theme-park | `樂園|遊樂園|主題園區` |
| playground | `遊戲場|兒童遊戲|共融|親子館|兒童館|遊樂場` |
| park | `公園|綠地|森林園區` |
| trail | `步道|自行車道|古道|綠廊|鐵馬道` |
| water | `海灘|海水浴場|沙灘|親水|戲水` |
| farm | `農場|牧場|農園|果園|茶園|休閒農業` |
| diy | `觀光工廠|體驗館|工坊|DIY` |
| market | `老街|夜市|市集|商圈` |
| hot-spring | `溫泉` |
| transport | `車站|火車站|鐵道|機場` |
| nature | `瀑布|海岸|濕地|峽谷|風景區` |

### 4.6 `moc_kids_events` adapter

1. Send a plain GET. The body is a JSON array.
2. Each `showInfo[]` entry becomes one occurrence. `time` and `endTime` are in the format
   `yyyy/MM/dd HH:mm:ss`, local time; convert to ISO with `+08:00`.
3. Parse the city and district from `location` using the first `XX市|XX縣` token followed by
   `…區|鄉|鎮|市`, after normalising 台 to 臺. Pass `latitude` and `longitude` through.
4. `source_categories` = `[category, "4"]`. `kid_tags` = `["family"]`. `kid_score` = 80.
5. `is_free` = true when `免費` appears in a price string or in `discountInfo`.
6. `organizer` = `masterUnit` joined with 、. `website_url` = `sourceWebPromote`. `ticket_url` = `webSales`.
7. `images` = `imageUrl` if it is https, with `credit = sourceWebName`.
8. Skip shows without `time`. Drop events left with zero shows.

Reference: [`prototypes/moc_events.jq`](ingestion/prototypes/moc_events.jq).

### 4.7 `taipei_travel_*` adapter (optional, P2)

Only build this after access is restored (ADR-0003).

1. Request each language in `config.langs` with page = 1..n and `Accept: application/json`.
2. Pace requests per host to `config.min_interval_ms` (1,000 ms).
3. Stop when the response is 204, or `data` is empty, or `page * 30 >= total`.
4. Merge the languages into one row per `id`: `name[lang]`, `description[lang]` from `introduction`, and
   so on. Use `source_id = String(id)`.
5. Detect the Cloudflare challenge: status 403 with header `cf-mitigated: challenge`, or `content-type`
   text/html. Fail fast with `error_class = 'blocked'` and **no retries**.

## 5. Idempotency, change detection and removals

### 5.1 Keys

- Places: `unique (source, source_id)`. Events: `unique (source, source_id)`.
- Internal ids are uuids. They stay stable across runs and are safe for favorites and deep links.

### 5.2 Changed records

`content_hash = md5((row − raw)::text || category_slugs)`.

| Case | Action | Counted as |
|---|---|---|
| Hash unchanged | Touch only (`last_seen_at`, `last_seen_run_id`, `removed_at = null`) | `unchanged` |
| Hash changed | Full overwrite of content columns. `updated_at` bumps. For events, occurrences are replaced | `updated` |
| New key | Insert | `inserted` |
| Was removed and is back | `removed_at = null` | `restored` (also counted in `updated` or `unchanged`) |

Editorial fields (`linked_place_id` via `linked`, and `duplicate_*`) are owned by the link and dedupe steps,
not by the feed. A `manual` duplicate decision is never overwritten.

### 5.3 Removed records (soft delete + guard)

After a `succeeded` run of a full-snapshot source, rows not seen in this run get `removed_at = now()`.
The API hides them at once. `atlas.purge()` deletes them after 90 days, so a source that comes back within
90 days restores the same uuids.

**Guard:** if the run saw fewer than `min_keep_ratio` × the active rows (0.80 for attractions, 0.50 for event
feeds, which shrink naturally as events expire), nothing is removed. The run ends `partial` with
`error_class = 'guard'`. Verified: a 100-row feed against 6,205 active rows tripped the guard and removed nothing.
Failed, partial and skipped runs never remove anything. An **empty feed** is a `validation` failure.

### 5.4 Duplicates

- `dedupe_places()` runs after every place run. It compares names (zh-Hant, with a leading `XX：` prefix
  stripped) within 300 m, across all official sources. The richer record wins; ties break on id. The losers
  get `duplicate_of` and `duplicate_reason = 'auto_dedupe'`. It writes only rows whose decision changed.
  Result on 2026-11-02: 282 hidden. A re-run changed 0 rows.
- `refresh_linked_places()`: curated → official links set `duplicate_reason = 'curated_link'` on the official twin.
- Event de-duplication across TA and MOC is **not** implemented in v1 (a known gap; MOC is kid-specific).

## 6. Retries, backoff, timeouts and rate limiting

| Concern | Rule |
|---|---|
| HTTP timeouts | Connect 10 s. Total 90 s for zip downloads, 30 s for JSON APIs (`AbortSignal.timeout`). |
| Retryable | Network errors, timeouts, HTTP 408, 425, 429, 500, 502, 503, 504 |
| Backoff | Up to 5 attempts. Delay = `random(0, min(60 s, 2 s × 2^attempt))` (full jitter). `Retry-After` is honoured, capped at 120 s. |
| Not retryable | Other 4xx. 403 with `cf-mitigated: challenge` → `blocked`. Parse and validation errors. |
| DB batch retry | 3 attempts (1 s, 2 s, 4 s) on SQLSTATE `08*`, `40001`, `40P01`, `57P01`, or a connection reset. Anything else fails the run (`db`). |
| Run-level retry | None inside a run. The next scheduled run (6 h later) retries. ETag makes it cheap when nothing changed. |
| Deadline | `INGEST_DEADLINE_MS` (Edge default 120,000; CLI 600,000). Checked between batches. If it passes, the run ends `partial`/`timeout` with no removals. |
| Rate limit | Per-host minimum interval `config.min_interval_ms` (default 1,000 ms) between requests. TA and MOC make one request per run. |
| User-Agent | `TaiwanKidsAtlas-Ingest/<version> (+https://github.com/VivienRg/Taiwan-Kids-Atlas-des-Merveilles)` |

Error classes stored in `ingestion_runs.error_class`: `network`, `http_4xx`, `http_5xx`, `blocked`, `parse`,
`validation`, `db`, `timeout`, `guard`, `not_modified` (reserved; a 304 ends as `skipped` with
`details.http.status = 304`), `unknown`.

## 7. Code layout, configuration and commands

```
supabase/
  config.toml                          # supabase init; add [functions.ingest] verify_jwt = false
  migrations/                          # provided (this task)
  seed.sql                             # dev sample rows (backend card)
  functions/
    deno.json                          # tasks: ingest, test; imports: postgres, fflate, std
    ingest/index.ts                    # Edge entrypoint
    _shared/ingest/
      core.ts  http.ts  db.ts  log.ts  cli.ts
      adapters/tw_tourism_attractions.ts  tw_tourism_events.ts  moc_kids_events.ts  curated.ts  taipei_travel.ts
      rules/kidScore.ts  rules/keywords.ts
      __tests__/  (fixtures = docs/data-sources/examples/*, expected = docs/ingestion/normalized-examples/*)
```

Edge Function HTTP contract (`POST /functions/v1/ingest`):

| Request | Response |
|---|---|
| Header `Authorization: Bearer $INGEST_CRON_SECRET`, body `{"source":"tw_tourism_attractions","trigger":"cron"}` | `202 {"accepted":true,"source":…,"run_id":123}`. `start_run` runs synchronously, then the work continues in `EdgeRuntime.waitUntil(...)`. |
| Wrong or missing secret | `401` |
| Unknown source | `400` |
| Source disabled and `trigger = "cron"` | `200 {"accepted":false,"reason":"disabled"}` |
| Run already in progress (55P03) | `409` |

Deploy it with JWT verification off (`[functions.ingest] verify_jwt = false`). The function checks
`INGEST_CRON_SECRET` with a constant-time comparison. DB access uses `npm:postgres` with
`SUPABASE_DB_URL` (provided to Edge Functions) or `DATABASE_URL` (CLI). Set `prepare: false` so the
transaction pooler also works.

CLI:

```bash
cd supabase/functions
deno task ingest --source tw_tourism_attractions            # one source
deno task ingest --all                                      # every enabled source, sequentially
deno task ingest --source curated                           # import data/activities.json + curated_links.json
deno task ingest --source tw_tourism_attractions --file ../../docs/…/Attraction-json.zip   # offline fixture
deno task ingest --source moc_kids_events --dry-run         # fetch + normalise, print stats, no DB writes
```

Environment variables are in [architecture.md §8](architecture.md#8-configuration-and-secrets).

Dev without pg_cron (vanilla Postgres): run the CLI on demand, or add a compose service that runs
`deno task ingest --all` on `INGEST_CRON` (default `15 8,14 * * *`) with a crond image.
Prod-like local loop:

```bash
supabase start
supabase functions serve ingest --no-verify-jwt --env-file supabase/functions/.env
psql "$DATABASE_URL" <<'SQL'
select vault.create_secret('http://host.docker.internal:54321/functions/v1/ingest', 'ingest_function_url');
select vault.create_secret('<same value as INGEST_CRON_SECRET>', 'ingest_cron_secret');
select atlas.invoke_ingest('moc_kids_events');    -- one-off trigger through pg_net
SQL
```

The `host.docker.internal` address works on macOS and Windows Docker. On Linux, use the gateway IP or
the Kong container name; verify this during implementation.

## 8. Logging, monitoring and alerting

- Log one JSON object per line to stdout: `{ts, level, source, run_id, stage, event, msg, ...counters}`.
  Stages: `start`, `fetch`, `parse`, `normalize`, `upsert`, `finish`. Never log secrets, full rows or
  request headers. In prod, Edge Function logs appear in the Supabase dashboard.
- The durable audit lives in `atlas.ingestion_runs` (one row per run, with counters, status, error class and
  details) and `atlas.ingestion_errors` (at most 500 per run, with stage and record id).
- Health is in the view `atlas.source_health`: `hours_since_success`, `consecutive_failures`, `last_error_class`
  and `active_records` per source.
- **Alert** (the devops card wires delivery) when any enabled source has `hours_since_success > 36`, or
  `consecutive_failures >= 2`, or `last_error_class = 'blocked'`, or `active_records` drops by more than 20%
  day-over-day.

```sql
select * from atlas.source_health where enabled order by source;
select id, source, status, started_at, finished_at - started_at as took, records_fetched, records_inserted,
       records_updated, records_unchanged, records_removed, error_class, error_message
  from atlas.ingestion_runs order by id desc limit 20;
```

## 9. Tests the backend card must provide

1. Unit tests (`deno test`): each adapter's `normalize()` on `docs/data-sources/examples/*`. The output
   must equal `docs/ingestion/normalized-examples/*` ignoring `raw`, or the jq reference output. Also test
   kidScore against the golden vectors in §4.4, `tw_time()` conversion, address parsing for MOC (including
   the `桃園文學館（桃園市桃園區…）` case), and the backoff schedule including Retry-After and the Cloudflare
   `blocked` detection.
2. Integration test against local Postgres (Supabase CLI or `imresamu/postgis:17-3.5` with the migrations):
   - ingest a fixture twice: second run `inserted = 0, updated = 0`;
   - remove 10 rows and change 5: `updated = 5, removed = 10`;
   - restore: `restored = 10`;
   - a 100-row feed trips the guard (`partial`, nothing removed);
   - a concurrent `start_run` raises 55P03;
   - an invalid row is logged;
   - `anon` cannot execute `atlas.*` or read `ingestion_runs`.
3. Live smoke (manual and QA): `deno task ingest --all` against the live endpoints in data-sources.md §8.

## 10. Verification performed for this design (2026-11-02)

Against `imresamu/postgis:17-3.5` (PostGIS in `extensions`, and separately in `public`) and the official
`supabase/postgres:17.11.0.015` image (non-superuser `postgres`, pg_cron, pg_net, Vault):

| Check | Result |
|---|---|
| All 7 migrations apply on a fresh DB; re-applying 0300 is harmless | OK on all three targets |
| TA attractions, 6,205 rows in 13 batches of 500 | `inserted 6205` in about 4 s (local Docker, Apple Silicon) |
| Identical re-run | `unchanged 6205`, 0 updated |
| 10 removed + 5 changed, then full again | `updated 5 / removed 10`, then `updated 5 / restored 10` |
| Truncated feed (100 rows) | `partial`, `guard` ("run saw 100 of 6205 active records"), 0 removed |
| TA events 1,173 (1,173 occurrences); MOC 58 (213 occurrences); re-run | `inserted`, then `unchanged` for all; 0 duplicate keys |
| Curated 87 with 5 links | 5 official twins hidden (`curated_link`); curated rows gained coordinates, district, images and zh-Hant name |
| Auto-dedupe | 282 hidden, stable on re-run. Visible kid-friendly official attractions after hiding: 788 |
| Concurrency / invalid rows / failed run | second `start_run` → "an ingestion run is already in progress" (55P03) / 2 invalid rows → `failed 2` + `ingestion_errors` / `failed` run removes nothing |
| `atlas_ingest` member role runs the full lifecycle; `anon` gets "permission denied" for `atlas.invoke_ingest`, writes, `ingestion_runs`, `sources.config` | OK |
| supabase/postgres: Vault secrets → `sync_cron_schedules()` → jobs `atlas_ingest_{tw_tourism_attractions,tw_tourism_events,moc_kids_events}` + `atlas_purge`; `invoke_ingest('moc_kids_events')` queues 1 pg_net request; `unschedule_all()` → 4, 0 remaining | OK |
| supabase/postgres smoke: 500-row upsert twice in one run, `places_search` as anon (Yilan, 30 km: 115 results), `source_health` | OK |
| PostgREST v12.2.3 serves the RPCs with GET array params; tables and ingest functions are not exposed | OK |
