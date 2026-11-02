# API contract (v1.0)

The mobile app reads data only through the **PostgREST RPC functions** below. Supabase serves them in
prod and the Supabase CLI serves them locally. Plain PostgREST v12 against the same migrations serves
the same paths without the `/rest/v1` prefix. The functions are defined in
[`supabase/migrations/20261102000500_public_api.sql`](../supabase/migrations/20261102000500_public_api.sql).
Every example in [`api/examples/`](api/examples/) is a **real response**, captured on 2026-11-02 as role
`anon` from a database loaded with that day's live feeds (6,205 TA + 87 curated places, 1,173 + 58 events).

The app is read-only and anonymous. It has no auth, no writes and no user data on the server in v1.
Favorites stay on the device.

## 1. Transport

| | Local dev (Supabase CLI) | Prod (Supabase) |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://127.0.0.1:54321/rest/v1` (iOS sim). Android emulator: `http://10.0.2.2:54321/rest/v1`. Device: `http://<LAN-IP>:54321/rest/v1` | `https://<project-ref>.supabase.co/rest/v1` |
| `EXPO_PUBLIC_API_ANON_KEY` | the `anon key` printed by `supabase start` | project anon (publishable) key |

Request rules:

- Call `GET {API_URL}/rpc/{function}?{params}`. Every function is `STABLE`, so GET works and is preferred
  because it is cacheable. `POST {API_URL}/rpc/{function}` with a JSON body of the same named params is equivalent.
- Headers: `apikey: <anon key>`, `Authorization: Bearer <anon key>`, `Accept: application/json`.
  Plain PostgREST ignores the key headers. Send them always so one client works everywhere.
- **Array params in GET** use the Postgres array literal, URL-encoded: `categories={animals,theme-park}` →
  `categories=%7Banimals,theme-park%7D`. In a POST body use a JSON array: `"categories":["animals","theme-park"]`.
- Omit a param to leave it unset. Do not send empty strings.
- Do not use these names as params, because PostgREST reserves them: `select`, `order`, `limit`, `offset`, `and`, `or`, `not`.
  That is why the API uses `sort`, `page_size` and `page_offset`.

Verified with PostgREST v12.2.3 (local container):

```
$ curl -sS -D - "$API/rpc/places_search?lang=en&kid_friendly=true&categories=%7Banimals,theme-park%7D&city=68000&page_size=2"
HTTP/1.1 200 OK
Content-Range: 0-1/*
Content-Type: application/json; charset=utf-8
[{"id":"0f233214-…","source":"curated","name":"Window on China Theme Park","city_name":"Taoyuan City", … ,"total_count":11},
 {"name":"i-Ride Taoyuan (motion cinema)", … ,"total_count":11}]

$ curl -sS -X POST -H 'Content-Type: application/json' -d '{"lang":"zh-Hant","categories":["animals"],"page_size":1}' "$API/rpc/places_search"
[{"id":"14635305-…","source":"tw_tourism_attractions","name":"鹿世界觀光牧場","name_lang":"zh-Hant", …}]

$ curl -sS "$API/rpc/place_detail?id=00000000-0000-0000-0000-000000000000"   → 200  null
$ curl -sS "$API/rpc/place_detail?id=not-a-uuid"  → 400 {"code":"22P02","message":"invalid input syntax for type uuid: \"not-a-uuid\""}
$ curl -sS "$API/places"            → 404 {"code":"42P01", … "relation \"public.places\" does not exist"}
$ curl -sS "$API/rpc/upsert_places" → 404 {"code":"PGRST202", …}   (ingestion functions are not exposed)
```

## 2. Conventions

- **Language.** Every function takes `lang` (default `en`). Supported content keys are `zh-Hant`, `en`, `ja`,
  `ko` and `zh-Hans`. Text fields resolve server-side with this fallback: requested → (for `zh*`: zh-Hant,
  then zh-Hans) → `en` → `zh-Hant` → any. Each translated field has a matching `*_lang` field that
  reports the language actually served (`name_lang`, `description_lang`).
  **Most official records exist only in zh-Hant** (see data-sources.md). The UI must render
  Chinese text gracefully in English mode, e.g. with a small "中文" badge when `name_lang ≠ requested lang`.
- **Pagination.** List functions take `page_size` (1–100, default 20; `places_map` 1–1000, default 500) and
  `page_offset` (default 0). Every row carries `total_count`, the number of rows matching the filters before
  paging. An empty array means no results or a page past the end. Next page:
  `page_offset + page_size < total_count`. Ordering is stable, with `id` as the final tie-breaker.
- **Not found.** `place_detail` and `event_detail` return HTTP 200 with body `null` when the id does not
  exist or the record was removed. Treat that as 404.
- **Errors.** PostgREST returns JSON `{code, message, details, hint}` with an HTTP status: 400 for a bad
  param type, e.g. a malformed uuid (`22P02`); 404 for an unknown function (`PGRST202`); 5xx for server
  errors. Show the generic error state and retry with backoff.
- **Types.** Timestamps are ISO-8601 in UTC (`2026-11-07T05:00:00+00:00`). Display them in `Asia/Taipei`.
  Distances are metres, rounded. Coordinates are WGS84 decimal degrees.
- **Images.** Only `https://` URLs are returned. They are hot-linked from government sites. Show `credit`
  when present. `thumbnail_url` is the first image or `null`; use a category-icon placeholder for null.
- **Duplicates.** List functions never return hidden duplicates. `place_detail` on a hidden record still
  works and returns `canonical_id ≠ id`. Deep links should navigate to `canonical_id`.

## 3. Endpoints

### 3.1 `places_search` — list and filter places

`GET /rpc/places_search`

| Param | Type | Default | Meaning |
|---|---|---|---|
| `lang` | text | `en` | Content language |
| `q` | text | – | Case-insensitive substring of the name in any language (≥1 char) |
| `categories` | text[] | – | Category slugs. A place matches if it has **any** of them. |
| `city` | text | – | City code, e.g. `68000`. See `areas_list`. |
| `district` | text | – | District code, e.g. `68000020` |
| `kid_friendly` | bool | – | `true` returns only `kid_score ≥ 50`. Omit for all places. |
| `lat`, `lng` | float8 | – | User position. Enables `distance_m` and distance sort. |
| `radius_m` | int | – | With lat/lng: keep places within this radius ("near me"). Suggested UI values: 2000/5000/10000/30000. |
| `sort` | text | `distance` if lat/lng set, else `kid_score` | `distance` \| `name` \| `kid_score` \| `recent` |
| `page_size`, `page_offset` | int | 20, 0 | See §2 |

Returns `PlaceSummary[]` (§4). Examples:
[`places_search.near_me.en.json`](api/examples/places_search.near_me.en.json) (kid-friendly within 15 km of
Zhongli, sorted by distance) and [`places_search.filters.zh-Hant.json`](api/examples/places_search.filters.zh-Hant.json)
(`categories={animals,theme-park}&city=68000&kid_friendly=true`).

```
GET /rpc/places_search?lang=en&kid_friendly=true&lat=24.9537&lng=121.2256&radius_m=15000&page_size=20
```

Places that are permanently closed, removed or hidden as duplicates are excluded. Places without
coordinates are included unless `radius_m` is set, and they sort last by distance.

### 3.2 `place_detail` — one place

`GET /rpc/place_detail?id=<uuid>&lang=en` → `PlaceDetail | null`.
Examples: [`place_detail.curated.en.json`](api/examples/place_detail.curated.en.json) (curated, enriched from
its linked official record) and [`place_detail.official.zh-Hant.json`](api/examples/place_detail.official.zh-Hant.json).

### 3.3 `places_map` — markers inside a viewport

`GET /rpc/places_map?min_lat=&min_lng=&max_lat=&max_lng=&lang=&categories=&kid_friendly=&page_size=`

All four bbox params are required. The function returns the top `page_size` places by `kid_score` inside
the box as light `MapMarker[]` rows. Call it on region-change-complete, debounced by 300 ms. If
`total_count > page_size`, show the hint "zoom in to see more".
Example: [`places_map.json`](api/examples/places_map.json).

### 3.4 `events_search` — upcoming events

`GET /rpc/events_search`

| Param | Type | Default | Meaning |
|---|---|---|---|
| `lang`, `q`, `categories`, `city`, `district`, `kid_friendly`, `lat`, `lng`, `radius_m` | | | Same as places. City, district and radius apply to **occurrences**. |
| `date_from` | date | today (Asia/Taipei) | Window start, inclusive |
| `date_to` | date | `date_from + 60` | Window end, inclusive |
| `sort` | text | `date` | `date` (next matching occurrence first) \| `distance` (needs lat/lng) |
| `page_size`, `page_offset` | int | 20, 0 | |

An event matches if **any occurrence** overlaps the window. `next_starts_at` / `next_ends_at` belong to the
best matching occurrence: the earliest, or the nearest when `sort=distance`. A `next_starts_at` in the past
with `next_ends_at` in the future means the event is ongoing (e.g. a long exhibition); show "Now on".
Cancelled events are included with `status = "cancelled"`; show them struck through.
Example: [`events_search.kids.en.json`](api/examples/events_search.kids.en.json).

### 3.5 `event_detail` — one event

`GET /rpc/event_detail?id=<uuid>&lang=en` → `EventDetail | null`. `occurrences` lists every occurrence
that ends no earlier than 30 days ago, ordered by start.
Example: [`event_detail.moc.en.json`](api/examples/event_detail.moc.en.json).

### 3.6 `categories_list`

`GET /rpc/categories_list?lang=en&kind=place|event` → `Category[]`, ordered by `sort`. `item_count` counts
active places, or for `kind=event` events not yet ended. Use it for the filter chips and hide chips with
`item_count = 0`.
Examples: [`categories_list.place.en.json`](api/examples/categories_list.place.en.json),
[`categories_list.event.zh-Hant.json`](api/examples/categories_list.event.zh-Hant.json).

### 3.7 `areas_list`

`GET /rpc/areas_list?lang=en` returns the 22 cities. `GET /rpc/areas_list?lang=en&parent=68000` returns the
districts of a city. The result is `Area[]` with `place_count`.
District English names exist for Taoyuan, Taipei and Hsinchu City. Elsewhere `name_lang` is `zh-Hant`.
Examples: [`areas_list.cities.en.json`](api/examples/areas_list.cities.en.json),
[`areas_list.taoyuan.en.json`](api/examples/areas_list.taoyuan.en.json).

### 3.8 `app_meta`

`GET /rpc/app_meta?lang=en` → `AppMeta`: API version, content languages, sources with licence, attribution
text and `last_success_at` (show "Data updated …" on the About screen), and counts.
Example: [`app_meta.en.json`](api/examples/app_meta.en.json).

## 4. Response types (TypeScript, normative)

```ts
export type Lang = 'en' | 'zh-Hant' | 'zh-Hans' | 'ja' | 'ko';
export type I18n = Partial<Record<Lang, string>>;
export type IndoorOutdoor = 'indoor' | 'outdoor' | 'mixed';
export type PriceLevel = 0 | 1 | 2 | 3;          // 0 free · 1 NT$1–200 · 2 NT$200–600 · 3 NT$600+ (original app's $ buckets)
export type ServiceStatus = 'open' | 'temporarily_closed' | 'permanently_closed' | 'unknown';
export type EventStatus = 'scheduled' | 'cancelled' | 'postponed' | 'rescheduled';
export type SourceId = 'tw_tourism_attractions' | 'tw_tourism_events' | 'moc_kids_events'
                     | 'curated' | 'taipei_travel_attractions' | 'taipei_travel_events';

export interface PlaceSummary {
  id: string;                    // uuid, stable across re-ingestion
  source: SourceId;
  name: string; name_lang: Lang;
  city_code: string | null; city_name: string | null;
  district_code: string | null; district_name: string | null;
  primary_category: string | null;   // slug with the lowest sort among category_slugs
  category_slugs: string[];
  kid_tags: KidTag[];
  kid_score: number;             // 0–100
  is_kid_friendly: boolean;      // kid_score >= 50
  age_min: number | null; age_max: number | null;
  indoor_outdoor: IndoorOutdoor | null;
  is_free: boolean | null;
  price_level: PriceLevel | null;
  lat: number | null; lng: number | null;
  distance_m: number | null;     // only when lat/lng were sent
  thumbnail_url: string | null;
  updated_at: string;
  total_count: number;
}

export interface Ref { code: string; name: string }
export interface ImageRef { url: string; caption: string | null; credit: string | null }
export interface CategoryRef { slug: string; name: string; icon: string }
export interface Attribution {
  source_name: string; publisher: string; license: string; license_url: string | null;
  dataset_url: string | null; text: string;          // text = 顯名聲明, must be shown (§7)
}
export interface OpeningHours {
  periods: Array<{
    days: Array<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun'|'public_holidays'|'day_before_holidays'|'day_after_holidays'|'typhoon_day'>;
    opens: string; closes: string;     // "HH:MM" local Asia/Taipei
    label: I18n;                       // raw I18n object, e.g. {"zh-Hant":"平日營運時間"}
    valid_from: string | null; valid_to: string | null;
  }>;
}

export interface PlaceDetail {
  id: string; canonical_id: string; source: SourceId; source_id: string;
  name: string; name_lang: Lang; names: I18n; alt_names: string[];
  description: string | null; description_lang: Lang | null;
  address: string | null; postal_code: string | null;
  city: Ref | null; district: Ref | null;
  location: { lat: number; lng: number } | null;
  phone: string | null; website_url: string | null; booking_url: string | null;
  categories: CategoryRef[];
  kid_tags: KidTag[]; kid_score: number; is_kid_friendly: boolean;
  age_min: number | null; age_max: number | null; indoor_outdoor: IndoorOutdoor | null;
  is_free: boolean | null; price_level: PriceLevel | null; fee_text: string | null;
  opening_hours: OpeningHours | null;        // structured hours (only ~77 official records have them)
  opening_hours_text: string | null;         // free text; show when opening_hours is null
  facilities: string[];                      // Tourism Data Standard FacilityEnum codes as strings
  images: ImageRef[];
  service_status: ServiceStatus;
  source_url: string | null; source_updated_at: string | null; updated_at: string;
  attribution: Attribution;
  upcoming_events: Array<{ id: string; name: string; starts_at: string; ends_at: string | null }>;
}

export interface MapMarker {
  id: string; name: string; lat: number; lng: number;
  primary_category: string | null; icon: string | null;
  kid_score: number; is_kid_friendly: boolean; total_count: number;
}

export interface EventSummary {
  id: string; source: SourceId; name: string; name_lang: Lang; status: EventStatus;
  category_slugs: string[]; primary_category: string | null;
  kid_tags: KidTag[]; kid_score: number; is_kid_friendly: boolean; is_free: boolean | null;
  next_starts_at: string; next_ends_at: string | null; occurrence_count: number;
  venue_name: string | null;
  city_code: string | null; city_name: string | null; district_code: string | null; district_name: string | null;
  lat: number | null; lng: number | null; distance_m: number | null;
  thumbnail_url: string | null; total_count: number;
}

export interface EventDetail {
  id: string; source: SourceId; source_id: string;
  name: string; name_lang: Lang; names: I18n;
  description: string | null; description_lang: Lang | null;
  status: EventStatus; categories: CategoryRef[];
  kid_tags: KidTag[]; kid_score: number; is_kid_friendly: boolean;
  age_min: number | null; age_max: number | null;
  starts_at: string | null; ends_at: string | null;
  is_free: boolean | null; price_text: string | null; organizer: string | null;
  website_url: string | null; ticket_url: string | null; source_url: string | null;
  place_id: string | null; images: ImageRef[];
  occurrences: Array<{
    starts_at: string; ends_at: string | null; venue_name: string | null; address: string | null;
    city: Ref | null; district: Ref | null; location: { lat: number; lng: number } | null;
    price_text: string | null; ticket_url: string | null;
  }>;
  updated_at: string; attribution: Attribution;
}

export interface Category { slug: string; name: string; icon: string; sort: number; item_count: number }
export interface Area { code: string; level: 'city' | 'district'; parent_code: string | null;
                        name: string; name_lang: Lang; place_count: number }
export interface AppMeta {
  api_version: string; generated_at: string; content_languages: Lang[];
  sources: Array<{ id: SourceId; kind: 'place' | 'event'; name: string; publisher: string;
                   license: string; license_url: string | null; dataset_url: string | null;
                   attribution: string; enabled: boolean; last_success_at: string | null }>;
  counts: { places: number; kid_friendly_places: number; upcoming_events: number };
}
```

## 5. Enumerations

### 5.1 `kid_tags` (fixed vocabulary; the app owns the labels)

| tag | en | zh-Hant | suggested icon |
|---|---|---|---|
| `family` | Family-friendly | 親子友善 | 👨‍👩‍👧 |
| `playground` | Playground | 遊戲場 | 🛝 |
| `animals` | Animals | 動物 | 🐾 |
| `water_play` | Water play | 玩水 | 💦 |
| `rides` | Rides | 遊樂設施 | 🎢 |
| `learning` | Learning | 寓教於樂 | 📚 |
| `diy` | DIY / hands-on | 手作體驗 | 🎨 |
| `nature` | Nature | 自然 | 🌳 |
| `active` | Active | 活力運動 | 🏃 |
| `indoor` | Indoor | 室內 | 🏠 |
| `outdoor` | Outdoor | 戶外 | ☀️ |
| `air_con` | Air-conditioned | 有冷氣 | ❄️ |
| `nursing_room` | Nursing room | 哺集乳室 | 🍼 |
| `stroller_friendly` | Stroller-friendly | 推車友善 | 👶 |
| `dog_friendly` | Dog-friendly | 寵物友善 | 🐕 |
| `food` | Food on site | 有餐飲 | 🍜 |
| `free` | Free entry | 免費 | 🎉 |
| `seasonal` | Seasonal | 季節限定 | 🌸 |
| `shade` | Shady | 有遮蔭 | 🌳 |

The vocabulary comes from the original `FEATURES` list and `data/tags.txt`. An unknown tag must not
crash the app: render the raw tag string or hide it.

### 5.2 Categories

Slugs, with en/zh-Hant names and emoji icons, live in `atlas.categories` (migration 0300). Always render
names from `categories_list` or `CategoryRef`, never hard-coded. Current slugs:

- place: `animals playground theme-park museum science library park nature trail water farm diy culture
  market sports hot-spring temple transport other`
- event: `kids performance exhibition workshop festival movie culture market sports other`

### 5.3 Facilities codes worth surfacing

`"3"` nursing room 哺集乳室, `"56"` stroller rental 嬰兒車借用, `"1"` toilets, `"2"` gender-neutral toilet,
`"21"` accessible toilet, `"20"` accessible route, `"5"` elevator, `"10"` parking.

## 6. Client guidance (mobile)

- Use TanStack Query keys `['places', params]`, `['place', id, lang]`, `['map', bboxRounded, filters]`,
  `['events', params]`, `['categories', kind, lang]`, `['areas', parent, lang]` and `['meta', lang]`.
  Set `staleTime` to 10 min for lists, 1 h for categories/areas/meta, and 24 h `gcTime`. Persist the cache
  to AsyncStorage so offline mode shows the last data with an "offline" banner.
- Infinite lists: use `useInfiniteQuery` with `getNextPageParam = (last, all) =>
  sum(all.length) < last[0]?.total_count ? sum(...) : undefined`.
- Near me: ask for foreground location only when the user taps "Near me". Send `lat`, `lng` and
  `radius_m`. If permission is denied, fall back to the city filter.
- Map: round the bbox to 3 decimals for cache keys. Use `primary_category` → `icon` for the marker glyph.
- Open in maps: use `location` if present, otherwise `address`. iOS: `maps://?q=<name>&ll=<lat>,<lng>`.
  Android: `geo:<lat>,<lng>?q=<lat>,<lng>(<name>)`. Fallback:
  `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`.
- Language switch: change `lang` in every query key. Cached data for the other language stays valid.
- Favorites: store `PlaceSummary` snapshots keyed by id in AsyncStorage. Refresh them from `place_detail`
  when online. If that returns `null`, the place was removed: show it greyed out with a "no longer listed" note.

## 7. Attribution display requirement

The OGDL-Taiwan-1.0 licence requires the 顯名聲明. The app **must**:

1. Show every enabled source's `attribution` (from `app_meta`) on the About/Settings screen, with a link
   to `license_url`.
2. Show `attribution.publisher` and `attribution.source_name` as a footer on place and event detail
   screens, e.g. "資料來源：交通部觀光署 景點－觀光資訊資料庫".
3. Show image `credit` when present.

QA checks all three (see the QA card).

## 8. Versioning

- `app_meta.api_version` is `1.0`.
- Additive changes are allowed without a version bump: new optional params with defaults, new response
  fields, new categories or tags, new sources. Clients must ignore unknown fields.
- Breaking changes use a new function name (`places_search_v2`). The old function stays until no
  supported app version calls it.

## 9. Mocks

Until the backend branch is ready, the app can run in mock mode (`EXPO_PUBLIC_API_MODE=mock`). In that
mode it serves the fixtures in `docs/api/examples/` (copied into `mobile/src/api/__fixtures__/`). It
applies `page_size` / `page_offset` and the `kid_friendly`, `categories` and `city` filters in memory, and
returns `null` for unknown detail ids. Unit tests use the same fixtures.
