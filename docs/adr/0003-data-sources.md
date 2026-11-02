# ADR-0003: Data sources — national Tourism Administration feeds as primary; Taipei Travel API defined but disabled

- Status: Accepted (revisit when Taipei Travel access is restored)
- Date: 2026-11-02

## Context

The request names the **Taipei Travel Open API** (`/open-api/{lang}/Attractions/All`) as the example feed.
The original project, however, is centred on **Taoyuan / Zhongli**: 42 of its 87 curated activities are in
Taoyuan, 20 in Hsinchu, 12 in Taipei and 11 in New Taipei. A Taipei-only feed would miss most of the
project's own area.

Live verification on 2026-11-02 (evidence in data-sources.md):

- Taipei Travel Open API: the Swagger spec was retrievable, but **every data endpoint returned
  `HTTP 403` with `cf-mitigated: challenge`** (Cloudflare managed challenge). That happened from the dev
  host with curl (default and browser user agents) and from a third-party fetcher. A real browser session
  stopped on an interactive Turnstile check. Scheduled server-side ingestion cannot pass this. We will not
  try to bypass bot protection.
- Tourism Administration "觀光資訊資料庫" (data.gov.tw 7777/7778): open, no key, OGDL v1, daily full
  snapshots with ETag. **6,205 attractions in all 22 cities**, including 379 in Taipei and 281 in Taoyuan,
  plus 1,173 events. zh-Hant only.
- Ministry of Culture events, category 親子 (data.gov.tw 10042): open, no key, OGDL v1. 58 family events
  with 213 dated shows. It looks like the source of the original project's events pipeline: the
  `events_kids.json` in commit `85bbbf9` (70 English-translated events, e.g. "National Museum of Natural
  Science – Ancient Stories…") has the same show-level venues and prices that this feed provides.
- TDX Tourism: 401 without an API key. It needs an approved account and carries the same Tourism
  Administration data.

## Decision

1. **Primary place source: `tw_tourism_attractions`.** Event sources: `tw_tourism_events` and `moc_kids_events`.
2. **Editorial layer: `curated`**, imported from `data/activities.json`. Linked records (`data/curated_links.json`)
   enrich curated entries and hide their official twins.
3. **Taipei Travel** (`taipei_travel_attractions`, `taipei_travel_events`) is fully specified (data-sources.md
   §4, ingestion.md §4.7) and registered in `atlas.sources`, with `enabled = false`. Building its adapter is
   P2, and must detect the challenge and fail fast with `error_class = 'blocked'`.
4. **TDX** is not used in v1. The env names `TDX_CLIENT_ID` and `TDX_CLIENT_SECRET` are reserved.
5. **Content language:** store zh-Hant from the government feeds and English from curated content. The API
   falls back across languages and reports the served language. Machine translation is out of scope for v1.

## Consequences

- The app works nationwide from day one, including Taoyuan. Taipei is covered by the national DB.
- **English coverage is thin.** Official records are zh-Hant only, and English names and descriptions exist
  only for the 87 curated places. The UI must handle Chinese content in English mode (api-contract.md §2).
  English, Japanese and Korean content would come from Taipei Travel (once unblocked) or a future
  translation pipeline with `machine_translated` flags.
- Categories and kid-friendliness for official records are **heuristics** (ingestion.md §4.4–4.5): class
  codes are noisy, and 872 of 6,205 attractions qualify. Curated links and future manual overrides
  (`duplicate_reason = 'manual'`, curated entries) are the quality lever.
- **Human follow-up needed:** request an allow-list for Taipei Travel API access from 臺北市政府觀光傳播局,
  or confirm that dropping it is acceptable. QA must not treat the disabled Taipei source as a defect. It is
  a documented external blocker.
