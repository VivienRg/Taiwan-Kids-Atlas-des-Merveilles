import type {
  PlaceSearchParams,
  PlaceSummary,
  PlaceDetail,
  EventsSearchParams,
  EventSummary,
  EventDetail,
  Category,
  Area,
  AppMeta,
  MapMarker,
  Lang,
} from '../types'
import {
  fetchPlaces,
  fetchPlace,
  fetchMapMarkers,
  fetchEvents,
  fetchEvent,
  fetchCategories,
  fetchAreas,
  fetchAppMeta,
} from './client'
import {
  useQuery,
  useInfiniteQuery,
  QueryClient,
} from '@tanstack/react-query'

/**
 * Taiwan Kids Atlas — data hooks.
 *
 * Query keys follow docs/api-contract.md §6:
 * ['places', params], ['place', id, lang], ['map', bbox, filters],
 * ['events', params], ['event', id, lang], ['categories', kind, lang],
 * ['areas', parent, lang], ['meta', lang].
 *
 * staleTime: 10 min lists · 1 h categories/areas/meta · gcTime 24 h.
 * The cache is persisted to AsyncStorage (see src/app/_layout.tsx) so the
 * last-fetched data is available offline.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const LIST_STALE = 10 * 60 * 1000
const REF_STALE = 60 * 60 * 1000

export interface PlacesResult {
  results: PlaceSummary[]
  total: number
}

export function usePlaces(params: PlaceSearchParams) {
  return useQuery<PlacesResult, Error>({
    queryKey: ['places', params],
    queryFn: () =>
      fetchPlaces(params).then(({ data, total }) => ({ results: data, total })),
    staleTime: LIST_STALE,
  })
}

/** Infinite places list; next page while fetched < total_count. */
export function useInfinitePlaces(params: PlaceSearchParams) {
  return useInfiniteQuery<PlacesResult, Error>({
    queryKey: ['places', params],
    initialPageParam: 0,
    queryFn: ({ pageParam }: { pageParam: unknown }) =>
      fetchPlaces({
        ...params,
        page_offset: typeof pageParam === 'number' ? pageParam : 0,
      }).then(({ data, total }) => ({ results: data, total })),
    getNextPageParam: (last, allPages) => {
      const fetched = allPages.reduce((sum, page) => sum + page.results.length, 0)
      return fetched < last.total ? fetched : undefined
    },
  })
}

export function usePlace(id: string | null, lang: Lang) {
  return useQuery<PlaceDetail | null, Error>({
    queryKey: ['place', id, lang],
    queryFn: () => (id ? fetchPlace(id, lang) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: REF_STALE,
  })
}

export function useMapPlaces(
  bbox: { min_lat: number; min_lng: number; max_lat: number; max_lng: number },
  filters: { categories?: string[]; kid_friendly?: boolean },
  lang: Lang,
) {
  const key = [
    'map',
    `${bbox.min_lat.toFixed(3)},${bbox.min_lng.toFixed(3)},${bbox.max_lat.toFixed(3)},${bbox.max_lng.toFixed(3)}`,
    JSON.stringify(filters),
    lang,
  ]
  return useQuery<MapMarker[], Error>({
    queryKey: key,
    queryFn: () =>
      fetchMapMarkers({ ...bbox, lang, ...filters }).then((r) => r.data),
    staleTime: LIST_STALE,
  })
}

export function useEvents(params: EventsSearchParams) {
  return useQuery<EventSummary[], Error>({
    queryKey: ['events', params],
    queryFn: () => fetchEvents(params).then((r) => r.data),
    staleTime: LIST_STALE,
  })
}

export function useEvent(id: string | null, lang: Lang) {
  return useQuery<EventDetail | null, Error>({
    queryKey: ['event', id, lang],
    queryFn: () => (id ? fetchEvent(id, lang) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: REF_STALE,
  })
}

export function useCategories(kind: 'place' | 'event', lang: Lang) {
  return useQuery<Category[], Error>({
    queryKey: ['categories', kind, lang],
    queryFn: () => fetchCategories(kind, lang),
    staleTime: REF_STALE,
  })
}

export function useAreas(parent: string | null, lang: Lang) {
  return useQuery<Area[], Error>({
    queryKey: ['areas', parent, lang],
    queryFn: () => fetchAreas(parent, lang),
    staleTime: REF_STALE,
  })
}

export function useAppMeta(lang: Lang) {
  return useQuery<AppMeta, Error>({
    queryKey: ['meta', lang],
    queryFn: () => fetchAppMeta(lang),
    staleTime: REF_STALE,
  })
}
