import type {
  AppMeta,
  Area,
  Category,
  EventDetail,
  EventSummary,
  MapMarker,
  PlaceDetail,
  PlaceSearchParams,
  PlaceSummary,
  EventsSearchParams,
} from '../types'

/**
 * Taiwan Kids Atlas — API client.
 *
 * Reads data only through PostgREST RPC functions (docs/api-contract.md).
 * GET {API_URL}/rpc/{function}?params with apikey + Authorization headers.
 *
 * Modes (EXPO_PUBLIC_API_MODE):
 *  - 'real' (default): live PostgREST / Supabase.
 *  - 'mock': serves docs/api/examples fixtures filtered in memory, used until the
 *    backend branch is available and for unit tests.
 */
declare const navigator: { onLine: boolean } | undefined

export const API_MODE = (process.env.EXPO_PUBLIC_API_MODE ?? 'real') as 'real' | 'mock'
export const API_URL = process.env.EXPO_PUBLIC_API_URL
export const API_ANON_KEY = process.env.EXPO_PUBLIC_API_ANON_KEY

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
    public details: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

function encodeParam(value: unknown): string {
  if (Array.isArray(value)) {
    // Postgres array literal, URL-encoded: {animals,theme-park}
    const items = value.map((v) => String(v)).join(',')
    return encodeURIComponent(`{${items}}`)
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return encodeURIComponent(String(value))
}

function buildQueryString(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    parts.push(`${key}=${encodeParam(value)}`)
  }
  return parts.join('&')
}

// ---------------------------------------------------------------- mock mode

type Fixture = unknown

function loadFixture(name: string): Fixture {
  // jest-expo / metro resolve this relative to the module at require time.
  try {
    const mod = require(`../api/__fixtures__/${name}.json`)
    return mod.default ?? mod
  } catch {
    return null
  }
}

function fixtureForPlacesSearch(lang: string): Fixture {
  return (
    loadFixture(`places_search.${lang}`) ||
    loadFixture('places_search.en') ||
    loadFixture('places_search.near_me.en') ||
    null
  )
}

function fixtureForPlaceDetail(lang: string): Fixture {
  return (
    loadFixture(`place_detail.${lang}`) ||
    loadFixture(`place_detail.curated.${lang}`) ||
    loadFixture('place_detail.curated.en') ||
    null
  )
}

function filterPlaces(rows: PlaceSummary[], params: PlaceSearchParams): PlaceSummary[] {
  return rows.filter((row) => {
    if (params.kid_friendly !== undefined && row.is_kid_friendly !== params.kid_friendly) return false
    if (params.categories?.length) {
      const cats = new Set(params.categories)
      if (!row.category_slugs.some((c) => cats.has(c))) return false
    }
    if (params.city && row.city_code !== params.city) return false
    if (params.district && row.district_code !== params.district) return false
    if (params.q) {
      const q = params.q.toLowerCase()
      const haystack = [row.name, row.city_name, row.district_name, ...row.category_slugs]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

function paginate<T>(rows: T[], page_size = 20, page_offset = 0): T[] {
  const size = Math.min(Math.max(page_size, 1), 100)
  const offset = Math.max(page_offset, 0)
  return rows.slice(offset, offset + size)
}

function mockPlacesSearch(params: PlaceSearchParams): { data: PlaceSummary[]; total: number } {
  const rows = (fixtureForPlacesSearch(params.lang ?? 'en') as PlaceSummary[]) ?? []
  const filtered = filterPlaces(rows, params)
  const page = paginate(filtered, params.page_size, params.page_offset)
  return { data: page, total: filtered.length }
}

function mockEventsSearch(params: EventsSearchParams): { data: EventSummary[]; total: number } {
  const rows = (loadFixture('events_search.kids.en') as EventSummary[]) ?? []
  const filtered = rows.filter((row) => {
    if (params.kid_friendly !== undefined && row.is_kid_friendly !== params.kid_friendly) return false
    if (params.categories?.length) {
      const cats = new Set(params.categories)
      if (!row.category_slugs.some((c) => cats.has(c))) return false
    }
    if (params.city && row.city_code !== params.city) return false
    if (params.district && row.district_code !== params.district) return false
    if (params.q) {
      const q = params.q.toLowerCase()
      if (![row.name, row.venue_name, row.city_name, row.district_name]
        .filter(Boolean).join(' ').toLowerCase().includes(q)) return false
    }
    return true
  })
  const page = paginate(filtered, params.page_size, params.page_offset)
  return { data: page, total: filtered.length }
}

function mockPlaceDetail(id: string, lang: string): PlaceDetail | null {
  const fixture = fixtureForPlaceDetail(lang)
  const rows = Array.isArray(fixture) ? fixture : fixture ? [fixture] : []
  const row = rows.find((r) => r.id === id)
  return row ?? null
}

function mockEventDetail(id: string): EventDetail | null {
  const row = (loadFixture('event_detail.moc.en') as EventDetail[])?.find((r) => r.id === id)
  return row ?? null
}

function mockCategories(kind: string, lang: string): Category[] {
  const rows = (loadFixture(`categories_list.${kind}.${lang}`) ||
    loadFixture(`categories_list.${kind}.en`) ||
    loadFixture('categories_list.place.en')) as Category[] | null
  return rows ?? []
}

function mockAreas(parent: string | null, lang: string): Area[] {
  const name = parent ? `areas_list.${parent}.${lang}` : `areas_list.cities.${lang}`
  const rows =
    (loadFixture(name) ||
      loadFixture(parent ? `areas_list.${parent}.en` : 'areas_list.cities.en') ||
      loadFixture('areas_list.cities.en')) as Area[] | null
  return rows ?? []
}

function mockAppMeta(lang: string): AppMeta {
  return (loadFixture(`app_meta.${lang}`) || loadFixture('app_meta.en')) as AppMeta
}

function mockMapMarkers(): MapMarker[] {
  return (loadFixture('places_map') as MapMarker[]) ?? []
}

// ---------------------------------------------------------------- real mode

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Request timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function realCall<T>(path: string): Promise<T> {
  if (!API_URL || !API_ANON_KEY) {
    throw new ApiError(0, null, 'Missing EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_ANON_KEY', null)
  }
  if (!isOnline()) {
    throw new ApiError(0, null, 'You appear to be offline. Showing cached data.', null)
  }
  const res = await withTimeout<Response>(
    fetch(`${API_URL}${path}`, {
      headers: {
        apikey: API_ANON_KEY,
        Authorization: `Bearer ${API_ANON_KEY}`,
        Accept: 'application/json',
      },
    }),
    10_000,
  )
  if (!res.ok) {
    let body: { code?: string; message?: string; details?: unknown } = {}
    try {
      body = (await res.json()) ?? {}
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body.code ?? null, body.message ?? `HTTP ${res.status}`, body.details)
  }
  return (await res.json()) as T
}

export async function rpcGet<T>(functionName: string, params: Record<string, unknown>): Promise<T> {
  const query = buildQueryString(params)
  const path = `/rpc/${functionName}${query ? `?${query}` : ''}`
  if (API_MODE === 'mock') {
    // Simulate network latency so loading states are exercised in mock too.
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 250))
    return realCall<T>(path) // eslint-disable-line no-constant-condition
  }
  return realCall<T>(path)
}

// ---------------------------------------------------------------- typed wrappers

export async function fetchPlaces(params: PlaceSearchParams): Promise<{
  data: PlaceSummary[]
  total: number
}> {
  if (API_MODE === 'mock') return mockPlacesSearch(params)
  const { data, total_count } = await rpcGet<{ data?: PlaceSummary[]; total_count?: number } & PlaceSummary[]>(
    'places_search',
    params as { [key: string]: unknown },
  )
  return { data: (Array.isArray(data) ? data : []), total: total_count ?? 0 }
}

export async function fetchPlace(id: string, lang: string): Promise<PlaceDetail | null> {
  if (API_MODE === 'mock') return mockPlaceDetail(id, lang)
  const row = await rpcGet<PlaceDetail | null>('place_detail', { id, lang })
  return row ?? null
}

export async function fetchMapMarkers(params: {
  min_lat: number
  min_lng: number
  max_lat: number
  max_lng: number
  lang?: string
  categories?: string[]
  kid_friendly?: boolean
  page_size?: number
}): Promise<{ data: MapMarker[]; total: number }> {
  if (API_MODE === 'mock') return { data: mockMapMarkers(), total: mockMapMarkers().length }
  const { data, total_count } = await rpcGet<{
    data?: MapMarker[]
    total_count?: number
  } & MapMarker[]>('places_map', params as { [key: string]: unknown })
  return { data: Array.isArray(data) ? data : [], total: total_count ?? 0 }
}

export async function fetchEvents(params: EventsSearchParams): Promise<{
  data: EventSummary[]
  total: number
}> {
  if (API_MODE === 'mock') return mockEventsSearch(params)
  const { data, total_count } = await rpcGet<{
    data?: EventSummary[]
    total_count?: number
  } & EventSummary[]>('events_search', params as { [key: string]: unknown })
  return { data: Array.isArray(data) ? data : [], total: total_count ?? 0 }
}

export async function fetchEvent(id: string, lang: string): Promise<EventDetail | null> {
  if (API_MODE === 'mock') return mockEventDetail(id)
  const row = await rpcGet<EventDetail | null>('event_detail', { id, lang })
  return row ?? null
}

export async function fetchCategories(kind: 'place' | 'event', lang: string): Promise<Category[]> {
  if (API_MODE === 'mock') return mockCategories(kind, lang)
  return rpcGet<Category[]>('categories_list', { lang, kind })
}

export async function fetchAreas(parent: string | null, lang: string): Promise<Area[]> {
  if (API_MODE === 'mock') return mockAreas(parent, lang)
  return rpcGet<Area[]>('areas_list', { lang, parent })
}

export async function fetchAppMeta(lang: string): Promise<AppMeta> {
  if (API_MODE === 'mock') return mockAppMeta(lang)
  return rpcGet<AppMeta>('app_meta', { lang })
}
