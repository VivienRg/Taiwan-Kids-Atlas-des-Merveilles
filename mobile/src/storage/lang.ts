import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Lang } from '../types'

export const CONTENT_LANG_KEY = '@taiwankidsatlas/content-lang'
export const UI_LANG_KEY = '@taiwankidsatlas/ui-lang'

export async function loadContentLang(): Promise<Lang> {
  try {
    const raw = await AsyncStorage.getItem(CONTENT_LANG_KEY)
    return raw && ['zh-Hant', 'en', 'ja', 'ko', 'zh-Hans'].includes(raw)
      ? (raw as Lang)
      : 'en'
  } catch {
    return 'en'
  }
}

export async function saveContentLang(lang: Lang): Promise<void> {
  await AsyncStorage.setItem(CONTENT_LANG_KEY, lang)
}

export async function loadUILang(): Promise<'en' | 'zh-Hant'> {
  try {
    const raw = await AsyncStorage.getItem(UI_LANG_KEY)
    return raw === 'zh-Hant' ? 'zh-Hant' : 'en'
  } catch {
    return 'en'
  }
}

export async function saveUILang(lang: 'en' | 'zh-Hant'): Promise<void> {
  await AsyncStorage.setItem(UI_LANG_KEY, lang)
}
