// Shared types for the ingestion core. Mirrors docs/ingestion.md §4
// ("Normalised row contract") and docs/api-contract.md.

export type Lang = 'zh-Hant' | 'en' | 'zh-Hans' | 'ja' | 'ko';

// Non-blank i18n object; empty languages are omitted, never stored as ''.
export type I18n = Partial<Record<Lang, string>>;

export type IndoorOutdoor = 'indoor' | 'outdoor' | 'mixed';
export type PriceLevel = 0 | 1 | 2 | 3;
export type ServiceStatus = 'open' | 'temporarily_closed' | 'permanently_closed' | 'unknown';
export type EventStatus = 'scheduled' | 'cancelled' | 'postponed' | 'rescheduled';

export interface ImageIn {
  url: string;           // https only
  caption?: I18n;
  credit?: string | null;
}

export interface OpeningHoursIn {
  periods: Array<{
    days: string[];
    opens: string;   // "HH:MM" Asia/Taipei
    closes: string;
    label?: I18n;
    valid_from?: string | null;
    valid_to?: string | null;
  }>;
}

export interface OccurrenceIn {
  starts_at: string;   // ISO-8601 with offset
  ends_at?: string | null;
  venue_name?: I18n;
  address?: I18n;
  city_code?: string | null;
  city_name?: string | null;
  district_code?: string | null;
  district_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  price_text?: I18n;
  ticket_url?: string | null;
}

export interface NormalizedPlace {
  source_id: string;
  name: I18n;
  alt_names?: string[];
  description?: I18n;
  address?: I18n;
  postal_code?: string | null;
  city_code?: string | null;
  city_name?: string | null;
  district_code?: string | null;
  district_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  website_url?: string | null;
  booking_url?: string | null;
  source_url?: string | null;
  source_categories?: string[]; // raw codes incl. "kw:<slug>" keyword codes
  tags?: string[];
  kid_tags?: string[];          // api-contract §5.1 vocabulary only
  kid_score?: number;           // 0..100
  age_min?: number | null;
  age_max?: number | null;
  indoor_outdoor?: IndoorOutdoor | null;
  is_free?: boolean | null;
  price_level?: PriceLevel | null;
  fee_text?: I18n;
  opening_hours?: OpeningHoursIn | null;
  opening_hours_text?: I18n;
  facilities?: string[];        // FacilityEnum codes as strings
  images?: ImageIn[];
  service_status?: ServiceStatus;
  linked?: { source: string; source_id: string } | null; // curated only
  source_updated_at?: string | null;
  raw?: unknown;                // excluded from content_hash
}

export interface NormalizedEvent {
  source_id: string;
  name: I18n;
  occurrences: OccurrenceIn[];  // >= 1, replaced wholesale on change
  description?: I18n;
  source_categories?: string[];
  tags?: string[];
  kid_tags?: string[];
  kid_score?: number;
  age_min?: number | null;
  age_max?: number | null;
  status?: EventStatus;
  is_free?: boolean | null;
  price_text?: I18n;
  organizer?: I18n;
  website_url?: string | null;
  ticket_url?: string | null;
  source_url?: string | null;
  images?: ImageIn[];
  venue_name?: I18n;
  address?: I18n;
  city_code?: string | null;
  city_name?: string | null;
  district_code?: string | null;
  district_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  source_updated_at?: string | null;
  raw?: unknown;
}

export interface UpsertStats {
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  restored: number;
  failed: number;
}

export interface SourceRow {
  id: string;
  kind: 'place' | 'event';
  name: unknown;
  publisher: unknown;
  attribution: unknown;
  license: string;
  license_url: string | null;
  homepage_url: string | null;
  dataset_url: string | null;
  enabled: boolean;
  is_full_snapshot: boolean;
  schedule_cron: string | null;
  min_keep_ratio: string;
  config: Record<string, unknown>;
  http_etag: string | null;
  http_last_modified: string | null;
}
