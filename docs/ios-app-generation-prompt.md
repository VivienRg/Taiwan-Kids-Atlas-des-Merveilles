# Prompt: Generate a Native iOS (SwiftUI) Version of *Taiwan Kids Atlas des Merveilles*

> Copy everything below the line into a fresh code-generation session. It is self-contained:
> it describes the concept, the exact feature set extracted from the existing web app, the
> data model, the phased backend strategy (GitHub-as-backend now → REST API + auth later),
> and the deliverables expected.

---

## ROLE

You are a senior iOS engineer. Build a production-quality, native **SwiftUI** iPhone app
called **"Taiwan Kids Atlas"** — a guide for discovering family- and kid-friendly activities
and destinations in Taiwan (initially within ~1 hour of Zhongli, Taoyuan).

This is a SwiftUI re-implementation of an existing static web app. The web app is a
single-page site that fetches a JSON list of activities and renders filterable cards.
Your job is to reproduce its concept and features natively, with a clean architecture
that lets the data backend evolve from "static files on GitHub" to "a real API with user
accounts" without rewriting the UI.

## CONCEPT

A community-curated atlas of kid-friendly outings. Each entry is an **Activity** (a place
or experience: aquarium, museum, park, trail, farm, theme park, old street, etc.). Parents
browse a scrollable list of rich cards, search and filter to find a good outing, then tap
through to Apple/Google Maps or the venue's website. Content today is curated via GitHub
pull requests; in the future users will register and contribute in-app.

## CORE FEATURES (extracted from the existing web app — implement all of these)

1. **Splash / launch screen** — logo + title "Taiwan Kids Atlas des Merveilles", brief fade,
   then the main browse screen. (Web version shows a 3s splash; on iOS use a short launch
   screen + first-load state, don't artificially delay.)

2. **Activity list (primary screen)** — a vertically scrolling feed of **activity cards**.
   Each card shows:
   - A **thumbnail image** (per-activity image keyed by the activity `id`; see Data/Backend).
   - A **category badge** (first category or indoor/outdoor label) overlaid on the image.
   - An **indoor/outdoor indicator**.
   - **Title** (activity name).
   - **Location** line: `district, city` (and optionally `• region`).
   - **Meta chips**: age range (e.g. "Ages 3–12"), price (`Free` when cost is `0`, else the
     cost range / "NT$…"), drive time ("15 min drive"), categories.
   - **Description** (truncated to ~100 chars in the list; full text on detail).
   - **Tags** (first few as chips, with a "+N" overflow chip).
   - **Action buttons**: "View on Map" (opens Maps) and, if present, "Website".

3. **Activity detail screen** — full image, full description, all meta, all tags, all
   categories, full address, and the map/website actions. (The web app is list-only; add a
   proper detail screen as the natural iOS pattern.)

4. **Search** — a search field that matches a case-insensitive substring across:
   name, description, tags, categories, district, city, region, and cost range.
   Debounce input (~300ms).

5. **Filtering** (combine all that are active; an activity must satisfy every active filter):
   - **Category** — single select from the set of categories present in the data.
   - **Region** — single select from regions present in the data.
   - **Age range** — min/max; include an activity if its `age_range` *overlaps* the selected
     range (not strict containment). Default 0–18 = no filtering.
   - **Price** — multi-select buckets: `Free` (cost == "0"), `Low` (1–200), `Medium` (200–600),
     `High` (600+). Parse cost_range strings like `"0"`, `"100-300"`, `"600+"`.
   - **Features** — multi-select: Dog friendly (`tags` contains "dog friendly"),
     Food nearby (tag "food"), Stroller friendly (tag "stroller friendly"),
     Indoor (`indoor_outdoor == "Indoor"`), Seasonal (tag "seasonal").
   - **Reset all filters** action.
   - Show an **active-filter indicator/badge** and a result count.
   Present filters in a sheet/side panel appropriate for iOS (e.g. a `.sheet` with sections).

6. **Sorting** — Relevance (default / data order), Name A→Z, Name Z→A, Drive time (asc),
   Price (asc, using the parsed numeric value of the cost bucket).

7. **Map actions** — "View on Map" opens the activity's `map_link` if present, otherwise a
   maps query built from `address_query` (or name + district + city + region + "Taiwan").
   Prefer opening Apple Maps with a fallback to Google Maps; honor the existing `map_link`.

8. **Empty / error / loading states** — skeleton or spinner while loading; a friendly
   "No activities found" with a reset action when filters exclude everything; a clear error
   state if the data fails to load.

9. **Offline-friendly** — cache the last successfully fetched activity list and thumbnails so
   the app is usable without connectivity; refresh on launch / pull-to-refresh.

## DATA MODEL

Mirror the existing JSON schema exactly so the same data files work unchanged. Define a
`Codable` `Activity`:

```
name: String                     // required
region: String                   // required (Taiwan county, e.g. "Taoyuan")
city: String                     // required
district: String                 // required
indoor_outdoor: String           // required, one of: "Indoor" | "Outdoor" | "Mixed"
categories: [String]             // required, >= 1
tags: [String]                   // descriptive tags
cost_range: String               // "0", "100-300", "600+", etc.
age_range: [Int]                 // exactly 2: [min, max]
natural: Bool                    // natural attraction vs human-made
desc: String                     // description
website: String?                 // optional URL
map_link: String                 // Google Maps URL
drive_min: Int                   // minutes from reference point (Zhongli)
address_en: String               // full English address
id: String                       // url-safe slug, matches thumbnails/<id>.png
address_query: String            // maps search query
```

Notes:
- Map snake_case JSON keys to Swift properties via `CodingKeys` (keep Swift-idiomatic names
  like `indoorOutdoor`, `costRange`, `ageRange`, `driveMin`, `addressEn`, `mapLink`,
  `addressQuery`, `description`/`desc`).
- Model `ageRange` as a 2-element array but expose convenience `ageMin`/`ageMax`.
- Treat `id` as the stable identity (`Identifiable`).
- Be tolerant of missing/optional fields; don't crash on a single malformed record — skip it.

There is also a planned **Event** type (the repo contains `event.schema.json` and empty
`events_*.json` files) — design the data layer so a second content type can be added later,
but you do **not** need to build the events UI now.

## BACKEND STRATEGY (phased — design for this explicitly)

Introduce a protocol so the UI never knows where data comes from:

```
protocol ActivityDataSource {
    func fetchActivities() async throws -> [Activity]
    func thumbnailURL(for activity: Activity) -> URL?
}
```

**Phase 1 (build this now) — GitHub as the backend.**
- Fetch the raw JSON from the GitHub repo:
  `https://raw.githubusercontent.com/VivienRg/Taiwan-Kids-Atlas-des-Merveilles/main/data/activities.json`
- Thumbnails are per-id PNGs:
  `https://raw.githubusercontent.com/VivienRg/Taiwan-Kids-Atlas-des-Merveilles/main/thumbnails/<id>.png`
  with a generated placeholder fallback when an image is missing (the web app renders an SVG
  placeholder with the activity name — reproduce a simple native placeholder).
- No auth, read-only. Cache responses (e.g. `URLCache` / on-disk JSON) for offline use.
- Put the base URL / branch in a single config so it's trivial to swap.

**Phase 2 (do NOT build, but leave clean seams for it) — REST API + database + accounts.**
- Same `ActivityDataSource` protocol, new implementation hitting a REST/JSON API.
- **User registration & login** (email/password and/or Sign in with Apple), auth token
  storage in Keychain, an injectable `AuthService`.
- **User-generated content**: submit a new activity in-app (today this is a GitHub Issue form
  — see the repo's `.github/ISSUE_TEMPLATE/add_activity.yml` for the exact fields), plus
  favorites/saved lists tied to the account.
- Server-side validation mirrors `data/activity.schema.json`.
- Keep all of this behind protocols/feature flags so Phase 1 ships independently.

## ARCHITECTURE & TECH REQUIREMENTS

- **SwiftUI**, iOS 16+ (use `NavigationStack`, `.searchable` if suitable, `async/await`).
- **MVVM**: views are dumb; a `@MainActor` `ActivityListViewModel` holds the loaded data,
  the current filter/sort/search state, and the derived filtered list. Filtering/sorting is
  pure and unit-testable, factored out of the view.
- Dependency-inject the `ActivityDataSource` (protocol) so Phase 1/Phase 2 and tests can swap it.
- Async image loading with caching (AsyncImage or a small caching loader) + placeholder.
- No third-party dependencies unless clearly justified; prefer the standard library / SwiftUI.
- Localizable strings (the audience is bilingual EN / zh-Hant Taiwan); structure for
  localization even if you ship English first.
- Accessibility: Dynamic Type, VoiceOver labels on cards and actions.
- Reasonable visual design: clean, warm, family-friendly. The web app uses the Inter font,
  a light background (#fcf8f3), rounded cards, pill-shaped chips, and a category badge over
  the image — match that spirit with native components.

## DELIVERABLES

1. A complete, compiling Xcode project structure (list the files and their roles).
2. The `Activity` model + `CodingKeys` + parsing tolerant of bad records.
3. `ActivityDataSource` protocol + `GitHubActivityDataSource` (Phase 1) with caching.
4. `ActivityListViewModel` with search, filter, sort, reset, result count, loading/error state.
5. Views: launch/splash, activity list with cards, filter sheet, activity detail, empty/error.
6. Map + website opening helpers (Apple Maps with Google fallback, honoring `map_link`).
7. Unit tests for the filtering/sorting/price-parsing logic (port the web app's exact rules).
8. A short README explaining how to point it at a different branch/URL and where the Phase 2
   API/auth seams are.

## ACCEPTANCE CRITERIA

- Launches, loads the live `activities.json` from GitHub, and shows all ~87 activities as cards.
- Search, every filter, and every sort behave like the rules described above (overlap-based
  age filter; free/low/medium/high price buckets; feature filters keyed off tags / indoor flag).
- Tapping a card opens detail; map/website actions work; missing thumbnails show a placeholder.
- Works offline after first load (cached data + images).
- Swapping `GitHubActivityDataSource` for a future `APIActivityDataSource` requires no changes
  to the views or view model.

Generate the full Swift code now, organized by file, and explain key decisions briefly as you go.
