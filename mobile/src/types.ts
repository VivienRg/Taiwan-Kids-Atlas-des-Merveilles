/**
 * Taiwan Kids Atlas — API types.
 * Normative source: docs/api-contract.md §4 (Response types).
 */
export type Lang = 'zh-Hant' | 'en' | 'ja' | 'ko' | 'zh-Hans'

export type I18n = Partial<Record<Lang, string>>

export type IndoorOutdoor = 'indoor' | 'outdoor' | 'mixed'

export type PriceLevel = 0 | 1 | 2 | 3 // 0 free · 1 NT$1–200 · 2 NT$200–600 · 3 NT$600+

export type ServiceStatus = 'open' | 'temporarily_closed' | 'permanently_closed' | 'unknown'

export type EventStatus = 'scheduled' | 'cancelled' | 'postponed' | 'rescheduled'

export type SourceId =
  | 'tw_tourism_attractions'
  | 'tw_tourism_events'
  | 'moc_kids_events'
  | 'curated'
  | 'taipei_travel_attractions'
  | 'taipei_travel_events';

export interface KidTagVocabulary {
  tag: string
  label: string
  labelZhHant: string
  emoji: string
}

export interface PlaceSummary {
  id: string
  source: SourceId
  name: string
  name_lang: Lang
  city_code: string | null
  city_name: string | null
  district_code: string | null
  district_name: string | null
  primary_category: string | null
  category_slugs: string[]
  kid_tags: string[]
  kid_score: number
  is_kid_friendly: boolean
  age_min: number | null
  age_max: number | null
  indoor_outdoor: IndoorOutdoor | null
  is_free: boolean | null
  price_level: PriceLevel | null
  lat: number | null
  lng: number | null
  distance_m: number | null
  thumbnail_url: string | null
  updated_at: string
  total_count: number
}

export interface Ref {
  code: string
  name: string
}

export interface ImageRef {
  url: string
  caption: string | null
  credit: string | null
}

export interface CategoryRef {
  slug: string
  name: string
  icon: string
}

export interface Attribution {
  source_name: string
  publisher: string
  license: string
  license_url: string | null
  dataset_url: string | null
  text: string
}

export interface OpeningHoursPeriod {
  days: string[]
  opens: string
  closes: string
  label: I18n
  valid_from: string | null
  valid_to: string | null
}

export interface OpeningHours {
  periods: OpeningHoursPeriod[]
}

export interface PlaceDetail {
  id: string
  canonical_id: string
  source: SourceId
  source_id: string
  name: string
  name_lang: Lang
  names: I18n
  alt_names: string[]
  description: string | null
  description_lang: Lang | null
  address: string | null
  postal_code: string | null
  city: Ref | null
  district: Ref | null
  location: { lat: number; lng: number } | null
  phone: string | null
  website_url: string | null
  booking_url: string | null
  categories: CategoryRef[]
  kid_tags: string[]
  kid_score: number
  is_kid_friendly: boolean
  age_min: number | null
  age_max: number | null
  indoor_outdoor: IndoorOutdoor | null
  is_free: boolean | null
  price_level: PriceLevel | null
  fee_text: string | null
  opening_hours: OpeningHours | null
  opening_hours_text: string | null
  facilities: string[]
  images: ImageRef[]
  service_status: ServiceStatus
  source_url: string | null
  source_updated_at: string | null
  updated_at: string
  attribution: Attribution
  upcoming_events: { id: string; name: string; starts_at: string; ends_at: string | null }[]
}

export interface MapMarker {
  id: string
  name: string
  lat: number
  lng: number
  primary_category: string | null
  icon: string | null
  kid_score: number
  is_kid_friendly: boolean
  total_count: number
}

export interface EventSummary {
  id: string
  source: SourceId
  name: string
  name_lang: Lang
  status: EventStatus
  category_slugs: string[]
  primary_category: string | null
  kid_tags: string[]
  kid_score: number
  is_kid_friendly: boolean
  is_free: boolean | null
  next_starts_at: string
  next_ends_at: string | null
  occurrence_count: number
  venue_name: string | null
  city_code: string | null
  city_name: string | null
  district_code: string | null
  district_name: string | null
  lat: number | null
  lng: number | null
  distance_m: number | null
  thumbnail_url: string | null
  total_count: number
}

export interface EventOccurrence {
  starts_at: string
  ends_at: string | null
  venue_name: string | null
  address: string | null
  city: Ref | null
  district: Ref | null
  location: { lat: number; lng: number } | null
  price_text: string | null
  ticket_url: string | null
}

export interface EventDetail {
  id: string
  source: SourceId
  source_id: string
  name: string
  name_lang: Lang
  names: I18n
  description: string | null
  description_lang: Lang | null
  status: EventStatus
  categories: CategoryRef[]
  kid_tags: string[]
  kid_score: number
  is_kid_friendly: boolean
  age_min: number | null
  age_max: number | null
  starts_at: string | null
  ends_at: string | null
  is_free: boolean | null
  price_text: string | null
  organizer: string | null
  website_url: string | null
  ticket_url: string | null
  source_url: string | null
  place_id: string | null
  images: ImageRef[]
  occurrences: EventOccurrence[]
  updated_at: string
  attribution: Attribution
}

export interface Category {
  slug: string
  name: string
  icon: string
  sort: number
  item_count: number
}

export interface Area {
  code: string
  level: 'city' | 'district'
  parent_code: string | null
  name: string
  name_lang: Lang
  place_count: number
}

export interface AppMetaSource {
  id: SourceId
  kind: 'place' | 'event'
  name: string
  publisher: string
  license: string
  license_url: string | null
  dataset_url: string | null
  attribution: string
  enabled: boolean
  last_success_at: string | null
}

export interface AppMeta {
  api_version: string
  generated_at: string
  content_languages: Lang[]
  sources: AppMetaSource[]
  counts: { places: number; kid_friendly_places: number; upcoming_events: number }
}

export interface PlaceSearchParams {
  lang?: Lang
  q?: string
  categories?: string[]
  city?: string
  district?: string
  kid_friendly?: boolean
  lat?: number
  lng?: number
  radius_m?: number
  sort?: 'distance' | 'name' | 'kid_score' | 'recent'
  page_size?: number
  page_offset?: number
}

export interface EventsSearchParams extends Omit<PlaceSearchParams, 'sort'> {
  date_from?: string
  date_to?: string
  sort?: 'date' | 'distance'
}
