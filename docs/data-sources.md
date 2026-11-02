# Data sources

Status as of **2026-11-02**. Every request in this file was run live from the dev host on that date,
unless a section says otherwise. A final re-check of every endpoint (15:01 UTC) is saved verbatim in
[`data-sources/examples/live-check.2026-11-02.txt`](data-sources/examples/live-check.2026-11-02.txt).
Raw samples of the responses are in
[`data-sources/examples/`](data-sources/examples/). The prototype normalisers that map these samples to the
database row contract are in [`ingestion/prototypes/`](ingestion/prototypes/).

## Summary

| ID (`atlas.sources.id`) | What | Auth | Status | Why |
|---|---|---|---|---|
| `tw_tourism_attractions` | Tourism Administration (觀光署) national attractions DB, Tourism Data Standard V2.1 | none | **Primary, enabled** | 6,205 attractions in all 22 cities, including 379 in Taipei and 281 in Taoyuan. Daily file, no key needed, conditional GET supported. |
| `tw_tourism_events` | Tourism Administration national events DB | none | **Enabled** | 1,173 events, same format and licence as the attractions DB. |
| `moc_kids_events` | Ministry of Culture (文化部) arts events, category 4 親子 (family) | none | **Enabled** | Kid-specific events: 58 events and 213 shows nationwide. This was the source of the original project's events pipeline. |
| `curated` | The original project's 87 hand-curated activities (`data/activities.json`) | n/a | **Enabled (import, no cron)** | Core editorial content, with English text and age ranges. |
| `taipei_travel_attractions` / `taipei_travel_events` | Taipei Travel Open API (臺北旅遊網) | none documented | **Defined, disabled** | The spec loads, but the data endpoints return a Cloudflare challenge (HTTP 403) to non-browser clients. See [ADR-0003](adr/0003-data-sources.md). |
| — | MOTC TDX Tourism API | OAuth2 client credentials | **Not used in v1** | Returns 401 without a key. The key needs an approved account (about 3 days), and guest mode allows only 20 calls per IP per day from a browser. It carries the same Tourism Administration data as above. |
| — | data.taipei "臺北旅遊網景點資料" datasets | none | **Not used** | They are 1–2 KB CSV pointer files (district → highlight list), not the attraction records. |

Licence for every government source: **政府資料開放授權條款－第1版 / Open Government Data License, version 1.0**
(SPDX `OGDL-Taiwan-1.0`, <https://data.gov.tw/license>). It permits commercial use, modification and
redistribution. It **requires the attribution statement (顯名聲明)**. `atlas.sources.attribution` stores
that text in zh-Hant and en, and the app must display it (see [api-contract.md §7](api-contract.md#7-attribution-display-requirement)).
The licence does not cover trademarks or patents.

---

## 1. `tw_tourism_attractions` — 景點－觀光資訊資料庫 (primary)

| | |
|---|---|
| Publisher | 交通部觀光署 Tourism Administration, MOTC (ProviderID `A15010000H`) |
| Catalogue | <https://data.gov.tw/dataset/7777> (license `1` = OGDL v1, update frequency "每1日") |
| Endpoint | `GET https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip` |
| Auth | None. The response sends `Access-Control-Allow-Origin: *`. |
| Params / pagination | None. This is a full snapshot zip of about 3.15 MB that expands to about 16.4 MB of JSON. |
| Languages | `Zh_tw` only. `En`, `Ja`, `Ko` and `Zh_cn` paths return 404. Only the hotel datasets have English or Japanese editions. |
| Update cadence | Daily. `UpdateInterval: 86400`. `Last-Modified` was `06:30:18 GMT` (14:30 Asia/Taipei). |
| Conditional GET | **Supported.** `If-None-Match: "<etag>"` and `If-Modified-Since` both return `304 Not Modified`. |
| Rate limit | None published. We make one request per run, twice a day. |
| Schema reference | 觀光資料標準 V2.0 PDF <https://media.taiwan.net.tw/Upload/觀光資料標準V2.0.pdf> (code tables in appendix §9–17) |

### Verification

```
$ curl -sS -D - -o Attraction-json.zip \
    https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip
HTTP/1.1 200 OK
Content-Type: application/x-zip-compressed
Last-Modified: Mon, 02 Nov 2026 06:30:18 GMT
ETag: "5580e9a0936add1:0"
Access-Control-Allow-Origin: *
Date: Mon, 02 Nov 2026 14:17:21 GMT
(3,152,821 bytes)

$ curl -sS -o /dev/null -D - -H 'If-None-Match: "5580e9a0936add1:0"' <same URL>
HTTP/1.1 304 Not Modified
```

Zip members:

| Member | Root key | Records | Content |
|---|---|---|---|
| `AttractionList.json` | `Attractions` | 6,205 | Main records. Every record has coordinates, City/Town codes, and ≥1 https image. |
| `AttractionServiceTimeList.json` | `AttractionServiceTimes` | 77 | Structured opening hours, keyed by `AttractionID`. |
| `AttractionFeeList.json` | `AttractionFees` | 38 | Structured fees, keyed by `AttractionID`. |
| `manifest.csv`, `schema-*.csv` | – | – | Field lists |

Each JSON file starts with a UTF-8 BOM. Strip it before `JSON.parse`.
Sample: [`tw_tourism_attractions.AttractionList.sample.json`](data-sources/examples/tw_tourism_attractions.AttractionList.sample.json),
[`…ServiceTimeList.sample.json`](data-sources/examples/tw_tourism_attractions.AttractionServiceTimeList.sample.json),
[`…FeeList.sample.json`](data-sources/examples/tw_tourism_attractions.AttractionFeeList.sample.json).

Envelope:

```json
{ "UpdateTime": "2026-11-02T14:30:17+08:00", "UpdateInterval": 86400, "Language": "Zh_tw",
  "ProviderID": "A15010000H", "Attractions": [ { ... } ] }
```

Record (abridged, real):

```json
{
  "AttractionID": "Attraction_379000000A_000351",
  "AttractionName": "臺北市立兒童新樂園",
  "Description": "臺北市立兒童新樂園位於士林區，是臺北都會區代表性的親子主題樂園。…",
  "PositionLat": 25.097239, "PositionLon": 121.514947,
  "AttractionClasses": [6, 12, 20, 27],
  "PostalAddress": { "City": "臺北市", "CityCode": "63000", "Town": "士林區", "TownCode": "63000110",
                     "ZipCode": "111", "StreetAddress": null },
  "Telephones": [ { "Tel": "(02)28333823" } ],
  "Images": [ { "Name": "遊樂設施：海盜船", "Description": null,
                "URL": "https://www.travel.taipei/content/images/attractions/573409/640x480_attractions-image-j5qokmrqwkevd5tcgnx48g.jpg",
                "Width": null, "Height": null, "Keywords": [] } ],
  "Facilities": [], "ServiceStatus": 1, "IsAccessibleForFree": null, "FeeInfo": "",
  "WebsiteURL": "", "ReservationURLs": [], "Tags": [], "UpdateTime": "2026-06-10T16:15:22+08:00"
}
```

Data facts from the 2026-11-02 file: 6,205 unique `AttractionID`s. Counts by city: 新北 665, 臺南 547, 臺中 512, 新竹縣 510, 臺北 379, 雲林 369, 花蓮 348, 高雄 336, 彰化 311,
臺東 291, 桃園 281, 嘉義縣 247, 金門 224, 苗栗 217, 宜蘭 178, 南投 175, 澎湖 143, 屏東 126, 基隆 119,
連江 85, 嘉義市 78, 新竹市 64. `TownCode` always starts with `CityCode`. All 10,868 image URLs are https.
They are hot-linked from 37 hosts (top: tourism.chcg.gov.tw 2,042, www.taiwanplace21.org.tw 1,056,
map.culture.tw 886). Spot checks returned `200 image/jpeg`, including the `www.travel.taipei/content/images/…`
paths, which are **not** behind the Cloudflare challenge that blocks the Taipei API.
`ServiceStatus`: 1 = 6,044, 0 (permanently closed) = 82, 3 (temporarily closed) = 79.
The feed contains **intra-source duplicates** from different providers, e.g. `葡萄王健康活力能量館` and
`桃園：葡萄王健康活力能量館` sit 7 m apart. `atlas.dedupe_places()` hides 282 of them (see ingestion.md §5.4).

**Data-quality caveat: class codes are noisy.** Providers apply `AttractionClasses` inconsistently. In this
file, class 18 (國家自然公園, "national natural park") is on 525 records, including stations, shopping malls
and a university (by city: 新北 218, 臺中 79, 嘉義縣 66, 高雄 35, 桃園 26…). Class 26 holds nature education centres, while zoos and aquariums such as 澎湖水族館 `[1]`,
頑皮世界野生動物園 `[2,12]` and Xpark `[12,18]` lack it. So class 18 is left unmapped, and the normaliser adds **name-keyword categories** (`kw:<slug>`,
ingestion.md §4.5). Categories and kid scores are best-effort heuristics. Curated links override them for
the places that matter most.

### Code tables used by the normaliser (觀光資料標準 V2.0 appendix)

- **AttractionClassEnum** (→ `category_mappings`, migration 0300): 1 文化, 2 生態, 3 文化資產, 4 宗教廟宇,
  5 藝術, 6 商圈商店, 7 國家公園, 8 國家風景區, 9 休閒農業, 10 溫泉, 11 自然風景, 12 遊憩, 13 體育健身,
  14 觀光工廠, 15 都會公園, 16 森林遊樂區, 17 平地森林園區, 18 國家自然公園, 19 公園綠地, 20 觀光遊樂業,
  21 原住民文化, 22 客家文化, 23 交通場站, 24 水域環境, 25 藝文場館, 26 生態場館 (zoo/aquarium),
  27 娛樂場館, 254 其他.
- **ServiceStatusEnum** → `service_status`: 0 `permanently_closed`, 1 `open`, 2 `open` (outside hours),
  3 `temporarily_closed`, 9 `unknown`.
- **FacilityEnum**: the normaliser stores the codes as strings in `facilities`. Kid-relevant codes are
  **3 哺集乳室 nursing room**, **56 嬰兒車借用 stroller rental**, 1 toilet, 2 gender-neutral toilet,
  4 drinking fountain, 5 elevator, 20 accessible route, 21 accessible toilet, 10 parking, 11 AED.
- **ServiceDayEnum** → opening-hours `days`: Monday…Sunday → `mon`…`sun`, PublicHolidays → `public_holidays`,
  DayBeforeHolidays → `day_before_holidays`, DayAfterHolidays → `day_after_holidays`, TyphoonDay → `typhoon_day`.

### Field mapping → NormalizedPlace (see ingestion.md §4.1)

| Source | Target |
|---|---|
| `AttractionID` | `source_id` |
| `AttractionName` | `name["zh-Hant"]` |
| `AlternateNames[]` | `alt_names` |
| `Description` | `description["zh-Hant"]` |
| `PostalAddress.City+Town+StreetAddress` | `address["zh-Hant"]` |
| `PostalAddress.ZipCode` | `postal_code` |
| `PostalAddress.CityCode` / `City` | `city_code` / `city_name` |
| `PostalAddress.TownCode` / `Town` | `district_code` / `district_name` (registers the district) |
| `PositionLat` / `PositionLon` | `lat` / `lng` (DB rejects points outside 20.5–26.5 N, 116.5–122.5 E) |
| `Telephones[0].Tel` | `phone` |
| `WebsiteURL` | `website_url` |
| `ReservationURLs[0]` | `booking_url` |
| `AttractionClasses[]` (as strings) + name keywords (`kw:<slug>`) | `source_categories` |
| `Tags[]` | `tags` |
| `Facilities[]` (as strings) | `facilities` |
| `Images[]` (https only) | `images[] = {url, caption:{zh-Hant:Name}, credit:Description}` |
| `ServiceStatus` | `service_status` |
| `IsAccessibleForFree` / fee list | `is_free`, `price_level` (max price: 0 → 0, ≤200 → 1, ≤600 → 2, else 3), `fee_text` |
| ServiceTimes (by ID) | `opening_hours.periods[]` |
| `ServiceTimeInfo` | `opening_hours_text["zh-Hant"]` |
| `UpdateTime` | `source_updated_at` |
| whole record | `raw` |
| derived | `kid_score`, `kid_tags` (ingestion.md §4.4) |

---

## 2. `tw_tourism_events` — 活動－觀光資訊資料庫

| | |
|---|---|
| Catalogue | <https://data.gov.tw/dataset/7778> (OGDL v1, daily) |
| Endpoint | `GET https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Event-json.zip` |
| Auth / pagination | None / none. Full snapshot of 504,490 bytes. Single member `EventList.json`, root key `Events`. |
| Languages | `Zh_tw` only |
| Conditional GET | Yes. `ETag` and `Last-Modified` are present (`06:30:21 GMT`). |

Verification (2026-11-02): `HTTP/1.1 200 OK`, `Content-Length: 504490`, `ETag: "e37aba3936add1:0"`. The file
held 1,173 events with `StartDateTime` from 2025-01-02 to 2026-12-31. `EventStatus`: 1,172 `EventScheduled`,
1 `EventCancelled`. EventClasses: 2 (arts) 1,015, 1 (festival) 133, 3 (annual) 15, 4 (recreation) 6, 9 (other) 3,
206 (exhibition) 1, 212 (concert) 1. **No record uses class 204 (親子)**, so kid relevance comes from keywords.
Sample: [`tw_tourism_events.EventList.sample.json`](data-sources/examples/tw_tourism_events.EventList.sample.json).

Mapping: `EventID` → `source_id`, `EventName` → `name`, `Description` → `description`, `EventClasses` →
`source_categories` (EventClassEnum, see migration 0300), `EventStatus` → `status`
(`EventScheduled|EventCancelled|EventPostponed|EventRescheduled` → `scheduled|cancelled|postponed|rescheduled`),
and `IsAccessibleForFree` → `is_free`. Each event becomes exactly **one occurrence** from `StartDateTime` to
`EndDateTime`, carrying the event's PostalAddress codes and position.

---

## 3. `moc_kids_events` — 文化部 藝文活動（親子類）

| | |
|---|---|
| Catalogue | <https://data.gov.tw/dataset/10042> "查詢單一類別未過期活動資料" (OGDL v1, daily) |
| Endpoint | `GET https://cloud.culture.tw/frontsite/opendata/activityOpenDataJsonAction.do?method=doFindActivitiesByCategory&category=4` |
| Auth | None. The response sends `Access-Control-Allow-Origin: *`. |
| Params | `category`: 1 音樂, 2 戲劇, 3 舞蹈, **4 親子**, 5 獨立音樂, 6 展覽, 7 講座, 8 電影, 11 綜藝, 13 競賽, 14 徵選, 15 其他, 17 演唱會, 19 研習課程, 200 閱讀 |
| Pagination | None. The response is a JSON array of all non-expired events in the category. |
| Languages | zh-Hant only |
| Conditional GET | Not offered (`Cache-Control: no-cache`, no ETag) |
| Rate limit | None published. We make one request per run. |

Verification (2026-11-02):

```
$ curl -sS -D - -o moc4.json '…doFindActivitiesByCategory&category=4'
HTTP/1.1 200
Content-Type: application/json;charset=UTF-8
Access-Control-Allow-Origin: *
→ 58 events, 213 showInfo entries (195 with latitude/longitude)
```

A category-4 response also includes events whose `category` field is another value (4: 42, 6: 9, 7: 3,
2/3/15/19: 1 each). The feed is the family listing, so treat **every record as family-relevant** and map
both `category` and `"4"`. Sample: [`moc_kids_events.category4.sample.json`](data-sources/examples/moc_kids_events.category4.sample.json).

Record shape (abridged, real):

```json
{
  "version": "1.4", "UID": "6ad1a67beb43ead9f13aebca",
  "title": "做伙來踅菜市仔—台語兒童繪本圖文手作工作坊／希希媽咪識童繪", "category": "7",
  "showInfo": [ { "time": "2026/11/07 13:00:00", "endTime": "2026/11/07 15:00:00",
                  "location": "桃園文學館（桃園市桃園區忠孝街11號）", "locationName": "…",
                  "onSales": "N", "price": "…活動費用｜免費…", "latitude": null, "longitude": null } ],
  "masterUnit": [], "imageUrl": "", "webSales": "https://www.accupass.com/…",
  "sourceWebPromote": "https://www.accupass.com/…", "discountInfo": "…", "descriptionFilterHtml": "",
  "editModifyDate": "2026/10/19 15:26:40", "startDate": "2026/11/07", "endDate": "2026/11/07"
}
```

Parsing notes:

- Times are local Asia/Taipei with no offset (`yyyy/MM/dd HH:mm:ss`). Convert them to `…+08:00`.
- City and district are not coded. Take the first `XX市|XX縣` token in `location` and the following
  `…區|鄉|鎮|市` token. The DB validates both against `admin_areas`, accepting 台 or 臺. Example:
  `桃園文學館（桃園市桃園區…）` → 桃園市 / 桃園區.
- `latitude` and `longitude` are strings or null.
- `descriptionFilterHtml` is plain text and often empty.
- `imageUrl` is often empty. Keep it only if it is https.
- Free detection: `免費` appears in `price` or `discountInfo`.

---

## 4. `taipei_travel_*` — Taipei Travel Open API (requested source; currently blocked)

| | |
|---|---|
| Publisher | 臺北市政府觀光傳播局 Department of Information and Tourism, Taipei City Government |
| Docs | <https://www.travel.taipei/open-api/swagger/ui/index#/Attractions/Attractions_All>, spec `https://www.travel.taipei/open-api/swagger/docs/V1` |
| Base | `https://www.travel.taipei/open-api` |
| Auth | None documented. **In practice every endpoint is behind a Cloudflare managed challenge** (see below). |
| Licence | OGDL v1, per the data.taipei listings of the same data (datasets `00000324`, `00000320`) |

### Endpoints (from the Swagger 2.0 spec, retrieved 2026-11-02)

| Operation | Path | Params | Languages |
|---|---|---|---|
| Attractions_All | `GET /{lang}/Attractions/All` | `categoryIds` (comma list), `nlat`, `elong` (WGS84, nearby search), `page` (30 records per page, default 1) | zh-tw, zh-cn, en, ja, ko |
| Events_Activity | `GET /{lang}/Events/Activity` | `begin`, `end` (yyyy-MM-dd), `page` | zh-tw, zh-cn, en, ja, ko, es, id, th, vi |
| Events_Calendar | `GET /{lang}/Events/Calendar` | `categoryId`, `begin`, `end`, `page` | zh-tw, zh-cn, en |
| Events_News | `GET /{lang}/Events/News` | `begin`, `end`, `page` | zh-tw, zh-cn, en, ja, ko |
| Miscellaneous_Categories | `GET /{lang}/Miscellaneous/Categories` | `type` = Activity, Calendar, Pictorial, Attractions, Accommodation or Tours | zh-tw, zh-cn, en, ja, ko |
| Tours_Theme, Media_Audio | … | `page` | … |

Produces `application/json`, `text/json`, `application/xml` or `text/xml`. Send `Accept: application/json`.
Documented responses: 200, 204 No Content, 403, 404, 500 "System Busy".

`Attraction` definition: `id` (int), `name`, `name_zh`, `open_status` (int), `introduction`, `open_time`,
`zipcode`, `distric` (sic), `address`, `tel`, `fax`, `email`, `months`, `nlat`, `elong`, `official_site`,
`facebook`, `ticket`, `remind`, `staytime`, `modified` (date-time), `url`, `category[] {id,name}`,
`target[] {id,name}` (audience, e.g. 親子共遊), `service[]`, `friendly[]` (friendly services), `images[]`,
`files[] {src,subject,ext}`, `links[] {src,subject}`.
`Activity` definition: `id`, `title`, `description`, `begin`, `end`, `posted`, `modified`, `url`, `distric`,
`address`, `nlat`, `elong` (strings), `organizer`, `co_rganizer`, `contact`, `tel`, `fax`, `ticket`,
`traffic`, `parking`, `files[]`, `links[]`.
The list envelope is **not in the spec**. Community usage says it is `{ "total": <int>, "data": [ … ] }`.
**This is unverified.** An adapter must check the envelope and fail with `error_class = 'parse'` when it
does not match.

### Verification result: blocked

```
$ curl -sS -D - -H 'Accept: application/json' 'https://www.travel.taipei/open-api/en/Attractions/All?page=1'
HTTP/2 403
content-type: text/html; charset=UTF-8
cf-mitigated: challenge
server: cloudflare
<title>Just a moment...</title>
```

The same 403 came back for `zh-tw` and for `/Miscellaneous/Districts`. It also came back with a desktop
Chrome User-Agent, and for the Swagger UI and spec URLs from this host. A real Chrome session stopped on an
interactive "Verify you are human" Turnstile checkbox. We did **not** try to bypass it. A third-party fetch
service retrieved the Swagger JSON, which is the source of the endpoint table above, but failed on all data
endpoints. A Wayback lookup returned HTTP 429 at the time of checking.

Consequences (see [ADR-0003](adr/0003-data-sources.md)):

- Both `taipei_travel_*` sources are defined in `atlas.sources` with `enabled = false`.
- Taipei coverage comes from `tw_tourism_attractions`, which has 379 Taipei records.
- An adapter is **optional (P2)**. If built, its first request must detect `cf-mitigated: challenge` or an
  HTML body and end the run with `status = failed`, `error_class = 'blocked'`, with no retries.
- Unblocking needs a human: ask 臺北市政府觀光傳播局 (contact listed on data.taipei: 02-27208889#7553) to
  allow-list the ingestion egress IP or user agent. Once unblocked, add the Taipei category ids to
  `category_mappings` (from `Miscellaneous/Categories?type=Attractions`) and enable the source. This source
  is valuable mainly for **en/ja/ko content** and the `target` (親子共遊) and `friendly` flags.

---

## 5. MOTC TDX Tourism API (evaluated, not used in v1)

```
$ curl -sS -D - 'https://tdx.transportdata.tw/api/basic/v2/Tourism/ScenicSpot/Taipei?%24top=2&%24format=JSON'
HTTP/2 401
server: nginx
Valid API Key Required
```

- Auth: register at tdx.transportdata.tw (review takes about 3 days). Then `POST
  https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token` with
  `grant_type=client_credentials&client_id=…&client_secret=…`. Send the result as
  `Authorization: Bearer <access_token>`. Tokens last about a day.
- Guest mode: browser only, `【基礎服務】` only, **20 calls per IP per day**.
- OData endpoints `/v2/Tourism/{ScenicSpot|Activity|Restaurant|Hotel}[/{City}]`, plus Tourism V2.1 APIs
  holding the same Tourism Administration data as §1–2.
- Reason not used: it needs a secret and an account approval, and it adds no coverage or languages over §1–2.
  Reconsider it if the media.taiwan.net.tw files are retired. The env names `TDX_CLIENT_ID` and
  `TDX_CLIENT_SECRET` are reserved.

## 6. data.gov.tw / data.taipei catalogue APIs (metadata only)

- `GET https://data.gov.tw/api/v2/rest/dataset/{id}` returns 200 with JSON metadata, used to confirm
  licence, frequency and download URLs for 7777, 7778, 7779, 10042 and 132493. Use it only for manual
  verification. Ingestion does not call it.
- `GET https://data.taipei/api/frontstage/tpeod/dataset.view?id=<uuid>` returns 200. The Taipei travel
  "attraction" datasets are small CSV files (Big5) listing highlights per district, not records.

## 7. `curated` — original project data

- File: `data/activities.json`, 87 records, schema `data/activity.schema.json`. Fields: id (slug), name, region,
  city, district, indoor_outdoor (Indoor/Outdoor/Mixed), categories[] (vocabulary in `data/categories.txt`),
  tags[], cost_range (`0`, `1–200`, `200–600`, `600+`), age_range [min,max], natural, desc, website, map_link,
  drive_min (from Zhongli), address_en, address_query.
- Coverage by city: Taoyuan 42, Hsinchu 20, Taipei 12, New Taipei 11, Miaoli 1, Yilan 1. **There are no
  coordinates.** Location comes from linking to a `tw_tourism_attractions` record (`data/curated_links.json`)
  or from geocoding (ingestion.md §4.3).
- Licence: MIT (repository README). Attribution text is in `atlas.sources`.

## 8. Re-verification checklist (for QA)

```bash
curl -sSI https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip   # 200, ETag
curl -sSI https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Event-json.zip        # 200, ETag
curl -sS 'https://cloud.culture.tw/frontsite/opendata/activityOpenDataJsonAction.do?method=doFindActivitiesByCategory&category=4' | jq length
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Accept: application/json' 'https://www.travel.taipei/open-api/en/Attractions/All?page=1'   # 403 today
```
