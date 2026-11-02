// Dynamic Expo config.
//
// app.json stays the single source of truth for everything static; this file
// injects only what has to come from the build environment (docs/architecture.md §8.1):
//
//   GOOGLE_MAPS_ANDROID_API_KEY  required for Android map tiles (restricted key,
//                                stored as an EAS environment variable per profile,
//                                never committed — docs/secrets.md §4)
//   EXPO_PUBLIC_APP_ENV          development | preview | production (informational)
//
// The key is written to both places the toolchains read it from:
//   * the react-native-maps config plugin -> com.google.android.geo.API_KEY in
//     AndroidManifest.xml (this is the one that makes the tiles load);
//   * android.config.googleMaps.apiKey   -> the Expo-standard config path.
// (app.json previously carried android.googleMaps.apiKey, which is not part of
// the Expo schema and was silently ignored.)
//
// iOS uses Apple Maps (react-native-maps' default provider) and needs no key.
import type { ExpoConfig } from 'expo/config';

import appJson from './app.json';

const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '';
const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

const base = appJson.expo as unknown as ExpoConfig;

const plugins = (base.plugins ?? []).map((plugin) => {
  if (Array.isArray(plugin) && plugin[0] === 'react-native-maps') {
    return ['react-native-maps', { androidGoogleMapsApiKey: mapsKey }] as [
      string,
      Record<string, unknown>,
    ];
  }
  return plugin;
});

export default (): ExpoConfig => {
  // `android.googleMaps` is not part of the Expo schema; drop it so the config
  // output stays valid (the key is injected through config.googleMaps below).
  const { googleMaps: _legacyKey, ...android } = (base.android ?? {}) as Record<string, unknown>;

  return {
    ...base,
    plugins,
    android: {
      ...android,
      config: {
        ...((android.config as Record<string, unknown> | undefined) ?? {}),
        googleMaps: { apiKey: mapsKey },
      },
    },
    extra: {
      ...base.extra,
      appEnv,
    },
  };
};
