# ADR-0001: Mobile stack — Expo (React Native, TypeScript) with Expo Router and EAS Build

- Status: Accepted
- Date: 2026-11-02
- Deciders: eng-architect (task t_daf00cf2)

## Context

- The goal is one codebase that builds and ships to both the iOS App Store and Google Play.
- The repo already leans this way:
  - `RN_MIGRATION_PLAN.md` recommends Expo.
  - An untracked prototype in `TaiwanKidsAtlas/` uses Expo SDK `~55.0.6`, React Native `0.83.2`, React
    `19.2.0`, React Navigation 7 (native-stack), AsyncStorage favourites, TypeScript, theme tokens ported
    from the web CSS, and bundle id / package `com.taiwankidsatlas.app`.
  - The root `package.json` has uncommitted Expo dependencies added by mistake. The root is the static
    GitHub Pages site.
- The team is small. Over-the-air fixes and cloud builds without a local Mac CI matter more than raw
  native performance.
- The app needs maps, location for "near me", image caching, offline cache, i18n (en + zh-Hant), and
  large touch targets.

## Decision

1. **Expo managed workflow with Continuous Native Generation.** Do not commit `ios/` or `android/`. Use
   the Expo SDK that the prototype targets (55). Upgrade with `npx expo install --fix` only.
2. **The app lives in `/mobile`.** Seed it from `TaiwanKidsAtlas/src` (components, theme, context). Then
   delete `TaiwanKidsAtlas/` and revert the root `package.json`, `package-lock.json` and `tsconfig.json`
   changes. Those belong to the prototype, not to the static site.
3. **Navigation: Expo Router** (file-based, built on React Navigation 7, which the prototype already uses).
   It gives deep links (`kidsatlas://place/<id>`) and typed routes. Layout: a tab bar with Discover,
   Explore (list), Map, Events, Favorites and Settings, plus stack screens `place/[id]` and `event/[id]`.
4. **Libraries** (install with `npx expo install` so versions match the SDK):
   - Data: `@tanstack/react-query`, `@tanstack/react-query-persist-client` and
     `@tanstack/query-async-storage-persister` over `@react-native-async-storage/async-storage`. This gives
     the offline cache of last-fetched data.
   - API: a typed `fetch` wrapper (`src/api/client.ts`) for PostgREST RPC (api-contract.md). Do **not** add
     `@supabase/supabase-js` in v1: there is no auth, so it would only add weight. It can be added later for
     auth or favourites sync without changing the contract.
   - Maps: `react-native-maps`. iOS uses Apple Maps and needs no key. Android uses Google Maps and needs
     `GOOGLE_MAPS_ANDROID_API_KEY` in the app config. The marker volume is capped at 500–1000 by
     `places_map`, so clustering is optional.
   - Location: `expo-location`, foreground permission only, requested when the user taps "Near me".
   - Images: `expo-image` (disk cache, placeholder support).
   - i18n: `i18next`, `react-i18next` and `expo-localization`. UI locales `en` and `zh-Hant` in v1. The API
     also serves `ja` and `ko` content when present.
   - Linking: `expo-linking` for open-in-maps, tel: and web.
   - Tests: `jest-expo` and `@testing-library/react-native`. Lint: `eslint-config-expo` and Prettier.
5. **Builds: EAS Build** with profiles in `mobile/eas.json`:
   - `development`: dev client, internal distribution.
   - `preview`: internal distribution; Android APK; iOS ad-hoc or simulator build.
   - `production`: Android AAB and iOS IPA, with `autoIncrement`.
   - Submission goes through EAS Submit (devops card, behind human approval).
6. **Identifiers:** keep `com.taiwankidsatlas.app` for both platforms, from the prototype. The owner must
   confirm it before the first store upload, because it cannot be changed after publishing.

## Alternatives considered

| Option | Why not |
|---|---|
| Bare React Native CLI | Loses EAS cloud builds, config plugins and CNG. More native maintenance for no feature we need. |
| Flutter | Rewrites the existing TS prototype and theme. No reuse of web/JS skills or of the original `app.js` logic. |
| Native Swift + Kotlin | Two codebases, which conflicts with the single-codebase requirement. |
| Capacitor / PWA wrapper around the existing site | Weak maps, offline and store-review story. The current site is a demo SPA, not an app shell. |
| Keep React Navigation without Expo Router | Workable, but deep links and typed routes would be hand-written. Expo Router is the SDK default and wraps the same navigator. |
| `expo-maps` instead of `react-native-maps` | Newer and less battle-tested. `react-native-maps` is mature and works in Expo Go and dev clients. Revisit in a later SDK. |

## Consequences

- iOS builds run in EAS cloud, so a Mac is only needed for the simulator.
- Store submission still needs an Apple Developer account (99 USD/yr) and a Google Play Console account
  (25 USD one-time). The devops card lists the credentials.
- The Android Google Maps key is a public-but-restricted value. Restrict it to the package name and SHA-1
  in Google Cloud.
- No server-side user data, so v1 has no privacy-policy complexity beyond location use. Location is never
  sent anywhere except as query params to our API.
