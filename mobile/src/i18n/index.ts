import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'

import type { Lang } from '../types'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

/**
 * Taiwan Kids Atlas — i18n.
 *
 * UI locales: en + zh-Hant. Content language (sent to the API `lang` param)
 * can be any of zh-Hant, en, ja, ko, zh-Hans (contract §2); when the UI locale
 * has no strings we fall back to en so nothing is ever untranslated.
 */
export const appLocales = ['en', 'zh-Hant'] as const
export type AppLocale = (typeof appLocales)[number]

export const contentLocales: Lang[] = ['zh-Hant', 'en', 'ja', 'ko', 'zh-Hans']

export function contentLocaleFromAppLocale(locale: AppLocale): Lang {
  return locale === 'zh-Hant' ? 'zh-Hant' : 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-Hant': { translation: zhHant },
  },
  lng:
    getLocales()[0]?.languageCode?.startsWith('zh') ? 'zh-Hant' : 'en',
  fallbackLng: 'en',
  supportedLngs: appLocales,
  interpolation: { escapeValue: false }, // RN strings are not HTML
})

export default i18n
