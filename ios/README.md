# Taiwan Kids Atlas — iOS app (SwiftUI)

A native SwiftUI re-implementation of the web app. It fetches the same
`data/activities.json` + `thumbnails/<id>.png` straight from GitHub, and renders a
searchable, filterable, sortable feed of kid-friendly activities — with an architecture
designed to swap in a real API + user accounts later without touching the UI.

- **iOS 16+**, SwiftUI, async/await, MVVM
- No third-party runtime dependencies
- Works offline after first load (cached JSON + image cache)

## Open & run

The project is checked in as source + an [XcodeGen](https://github.com/yonsm/XcodeGen) manifest
(no fragile `.pbxproj` in git).

```bash
brew install xcodegen          # once
cd ios
xcodegen generate              # creates TaiwanKidsAtlas.xcodeproj
open TaiwanKidsAtlas.xcodeproj # ⌘R to run, ⌘U to test
```

No XcodeGen? Create a new **iOS App** in Xcode (SwiftUI, iOS 16), delete its template
files, drag the `TaiwanKidsAtlas/` group in, add a Unit Test target and drag `Tests/` in,
then set the AppIcon/AccentColor names in Build Settings.

## Architecture

```
TaiwanKidsAtlas/
  App/         TaiwanKidsAtlasApp (URLCache setup) · RootView (splash → list)
  Models/      Activity (Codable, lenient) · Filters (FilterState, PriceBucket, Feature, SortOption)
  Filtering/   ActivityFilter — pure, testable filter/sort/price rules (ported from the web app)
  Services/    ActivityDataSource (protocol) · GitHubActivityDataSource (Phase 1) ·
               AppConfig (URLs) · DiskCache (offline)
  ViewModels/  ActivityListViewModel (@MainActor; search/filter/sort/load state)
  Views/       ActivityListView · ActivityCardView · ActivityDetailView · FilterSheetView ·
               Components (Chip/Badge/RemoteImage) · FlowLayout
  Utilities/   MapLauncher (Apple Maps + Google fallback, honours map_link)
  Resources/   Assets.xcassets (AppIcon, AccentColor)
Tests/         ActivityFilterTests · ActivityDecodingTests
```

The views and view model depend only on the `ActivityDataSource` **protocol**.

## Repoint the data

Everything lives in `Services/AppConfig.swift`:

```swift
AppConfig(owner: "VivienRg", repo: "Taiwan-Kids-Atlas-des-Merveilles", branch: "main")
```

Change the branch to preview a feature branch, or inject a different `ActivityDataSource`
into `ActivityListViewModel(dataSource:)`.

## Phase 2 seams (not built yet)

The protocol boundary is where the future API + accounts plug in:

1. **`APIActivityDataSource: ActivityDataSource`** — same two methods against a REST/JSON API.
   The UI and `ActivityListViewModel` do not change.
2. **`AuthService`** — registration / login (email-password and/or Sign in with Apple),
   token stored in Keychain. Inject it where features need a user.
3. **User content** — in-app activity submission (today this is the repo's GitHub Issue form,
   `.github/ISSUE_TEMPLATE/add_activity.yml`) and favorites/saved lists tied to the account.
4. **Bigger dataset** — the repo also publishes `data/places.json` (all-Taiwan harvest, a
   superset schema). A `PlacesDataSource` can be added alongside the activities source.

## Feature parity with the web app

Search (debounce-free, dataset is small) across name/desc/tags/categories/location/cost ·
single-select Category & Region · **overlap-based** age filter · Free/Low/Medium/High price
buckets · Dog/Food/Stroller/Indoor/Seasonal feature toggles · Relevance/Name/Drive/Price sort ·
reset + active-filter badge + result count · map/website actions · loading/empty/error/offline.
