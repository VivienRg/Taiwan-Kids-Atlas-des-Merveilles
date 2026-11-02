# Taiwan Kids Atlas — Mobile App

Cross-platform mobile frontend (iOS + Android) for the Taiwan Kids Atlas,
built as a single Expo/React Native codebase. Part of the
Taiwan-Kids-Atlas-des-Merveilles project.

## Stack

Expo SDK 55 (managed workflow, CNG), React Native 0.83.2, React 19.2,
Expo Router (file-based navigation), TypeScript, TanStack Query with
AsyncStorage persistence, i18next/react-i18next, expo-image, expo-location,
react-native-maps.

Data is read through the PostgREST RPC contract defined in
`docs/api-contract.md` (functions `places_search`, `place_detail`,
`places_map`, `events_search`, `event_detail`, `categories_list`,
`areas_list`, `app_meta`). The app is anonymous and read-only; favorites are
stored on the device only.

## Directory layout

```
mobile/
  app/                 Expo Router file-based routes
    (tabs)/            Tab screens: index (Discover), explore, map, events,
                       favorites, settings
    place/[id].tsx     Attraction detail
    event/[id].tsx     Event detail
    _layout.tsx        Root providers + stack
  src/
    api/               Typed RPC client (real + mock), TanStack Query hooks
    api/__fixtures__/  API contract fixtures (docs/api/examples) for mock mode
    api/__tests__/     Client tests
    components/        Shared UI (PlaceCard, ErrorBanner, EmptyState, …)
    api/__tests__/     Component tests
    context/           Device-local favorites (AsyncStorage)
    storage/           AsyncStorage helpers (favorites, content language)
    i18n/              i18next setup (en + zh-Hant UI)
    theme.ts           Brand theme tokens (ported from the web prototype)
    constants/kidTags.ts Kid tag vocabulary (contract §5.1)
    types.ts           API response types (contract §4)
    utils.ts           Formatting helpers
  app.json             Expo config (com.taiwankidsatlas.app)
  eas.json             EAS Build profiles
```

## Configuration

Environment variables (`.env` is gitignored):

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_MODE` | `real` (default) or `mock` |
| `EXPO_PUBLIC_API_URL` | PostgREST base URL, e.g. `http://127.0.0.1:54321/rest/v1` |
| `EXPO_PUBLIC_API_ANON_KEY` | PostgREST anon key |

In mock mode the app serves the fixtures in `src/api/__fixtures__/` (copied from
`docs/api/examples/`), applying pagination and the `kid_friendly`,
`categories`, `city`, `q` filters in memory. Unknown detail ids return null.

Local development (Supabase CLI):

```sh
# In another terminal, from the repo root:
supabase start   # serves PostgREST on http://127.0.0.1:54321

cd mobile
cp .env.example .env   # set EXPO_PUBLIC_API_URL=http://127.0.0.1:54321/rest/v1
npm install
npm run ios            # opens Expo in the iOS Simulator
npm run android        # opens Expo in the Android Emulator
```

Android map tiles require a Google Maps API key (`android.googleMaps.apiKey` in
`app.json` / the `react-native-maps` plugin). iOS uses Apple Maps and needs no key.

## Scripts

| Script | Purpose |
|---|---|
| `npm start` | Start Expo dev server |
| `npm run ios` | Open in iOS Simulator |
| `npm run android` | Open in Android Emulator |
| `npm run web` | Open in web browser |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run `tsc --noEmit` |

## Building

EAS Build is used for store builds:

```sh
npx eas build -p ios --profile preview
npx eas build -p android --profile preview
```

See `eas.json` for the `development`, `preview` and `production` profiles.
Store submission goes through EAS Submit and requires Apple Developer /
Google Play Console credentials (handled by the devops card).

## Screens

- **Discover** — featured kid-friendly places and upcoming events.
- **Explore** — searchable attraction list with category, city, kid-friendly
  filters and sorting.
- **Map** — markers inside the map viewport (debounced region queries), with a
  "Near me" location button.
- **Attraction detail** — images, description, opening hours, address, phone,
  website, "open in maps", categories, kid tags, attribution.
- **Events** — upcoming events with dates, venues and status.
- **Favorites** — device-local favorites (AsyncStorage).
- **Settings** — UI language (English / 繁體中文), content language, About with
  data source attribution (OGDL-Taiwan-1.0 顯名聲明).

## States handled

Loading, empty, error and offline states are shown throughout; the last-fetched
data is persisted to AsyncStorage (TanStack Query persist client, 24 h max age)
so the app remains usable offline. Touch targets are at least 44 dp and
accessibility labels/roles are set on interactive elements.

## Tests

```sh
npm test
```

Component tests cover the place card, error banner and empty state; client tests
cover the mock-mode RPC client (filters, pagination, null details).

## Language support

Content languages served by the API: `zh-Hant`, `en`, `ja`, `ko`, `zh-Hans`.
UI translations: English and 繁體中文. The content language is selectable in
Settings and is sent to the API as the `lang` parameter.

## Attribution

Data is published under OGDL-Taiwan-1.0 (government sources) and MIT (curated
sources). Attribution text and license links are shown on detail screens and in
Settings → About, per the licence 顯名聲明 requirement.