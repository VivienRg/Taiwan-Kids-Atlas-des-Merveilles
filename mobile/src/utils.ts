import type { PriceLevel } from './types'

/**
 * Taiwan Kids Atlas — formatting helpers.
 * Timestamps are UTC ISO-8601 from the API; display in Asia/Taipei (UTC+8).
 */
const TAIPEI_OFFSET = 8 * 60 // minutes

export function toTaipei(isoString: string): Date {
  const d = new Date(isoString)
  return new Date(d.getTime() + TAIPEI_OFFSET * 60 * 1000)
}

export function formatDateTime(isoString: string | null, lang: 'en' | 'zh-Hant'): string {
  if (!isoString) return ''
  const d = toTaipei(isoString)
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }
  return d.toLocaleString(lang === 'zh-Hant' ? 'zh-TW' : 'en-US', opts)
}

export function formatDate(isoString: string | null, lang: 'en' | 'zh-Hant'): string {
  if (!isoString) return ''
  const d = toTaipei(isoString)
  return d.toLocaleDateString(lang === 'zh-Hant' ? 'zh-TW' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return ''
  if (meters < 1000) return Math.round(meters) + ' m'
  return (meters / 1000).toFixed(1) + ' km'
}

export function priceLevelLabel(level: PriceLevel | null, lang: 'en' | 'zh-Hant'): string {
  if (level == null) return ''
  const labels: Record<PriceLevel, { en: string; zhHant: string }> = {
    0: { en: 'Free', zhHant: '免費' },
    1: { en: 'NT$1–200', zhHant: 'NT$1–200' },
    2: { en: 'NT$200–600', zhHant: 'NT$200–600' },
    3: { en: 'NT$600+', zhHant: 'NT$600+' },
  }
  return lang === 'zh-Hant' ? labels[level].zhHant : labels[level].en
}

export function categoryNameForSlug(
  slug: string | null,
  categories: { slug: string; name: string }[],
): string {
  if (!slug) return ''
  const match = categories.find((c) => c.slug === slug)
  return match ? match.name : slug
}

export function openInMapsUrl(
  lat: number | null,
  lng: number | null,
  name: string | null,
  address: string | null,
): string {
  const query = name || address || ''
  if (lat == null || lng == null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  }
  // Google Maps URL works on both iOS and Android and falls back to the web.
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}(${encodeURIComponent(query)})`
}

export function formatPhoneLink(phone: string | null): string | null {
  if (!phone) return null
  return `tel:${phone.replace(/\s/g, '')}`
}

export function isPast(isoString: string | null): boolean {
  if (!isoString) return false
  return new Date(isoString).getTime() < Date.now()
}
