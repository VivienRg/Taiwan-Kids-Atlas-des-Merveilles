-- Taiwan Kids Atlas — migration 0200: core schema
-- All data tables live in schema "atlas", which PostgREST does NOT expose.
-- Clients read through the public.* API functions (migration 0500).
-- Multilingual text is stored as jsonb objects keyed by BCP-47 tag:
--   {"zh-Hant": "...", "en": "...", "ja": "...", "ko": "...", "zh-Hans": "..."}
-- Keys are omitted (never empty strings) when a language is unavailable.
--
-- PostGIS / pg_trgm objects are referenced unqualified: Supabase installs them in "extensions",
-- some older projects and the postgis docker image have them in "public". Both are on the path.
set search_path = public, extensions;

create schema if not exists atlas;
comment on schema atlas is
  'Taiwan Kids Atlas data. Not exposed by PostgREST; read via public.* API functions.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function atlas.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Picks the best available language key of an i18n object.
-- Order: requested -> (zh-* family) -> en -> zh-Hant -> first key alphabetically.
create or replace function atlas.pick_lang(p jsonb, p_lang text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' or p = '{}'::jsonb then null
    else coalesce(
      case when p ? p_lang then p_lang end,
      case when p_lang like 'zh%' and p ? 'zh-Hant' then 'zh-Hant' end,
      case when p_lang like 'zh%' and p ? 'zh-Hans' then 'zh-Hans' end,
      case when p ? 'en' then 'en' end,
      case when p ? 'zh-Hant' then 'zh-Hant' end,
      (select k from jsonb_object_keys(p) as k order by k limit 1)
    )
  end;
$$;

-- Resolves an i18n object to text in the requested language (with fallback).
create or replace function atlas.t(p jsonb, p_lang text)
returns text
language sql
immutable
parallel safe
as $$
  select p ->> atlas.pick_lang(p, p_lang);
$$;

-- Normalises Taiwanese place names for lookups (台 -> 臺, trims spaces).
create or replace function atlas.norm_zh(p text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(btrim(replace(p, '台', '臺')), '');
$$;

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------

create table atlas.sources (
  id                 text primary key check (id ~ '^[a-z0-9_]+$'),
  kind               text not null check (kind in ('place', 'event')),
  name               jsonb not null,
  publisher          jsonb not null,
  homepage_url       text,
  dataset_url        text,
  license            text not null,
  license_url        text,
  attribution        jsonb not null,           -- i18n attribution statement (顯名聲明)
  enabled            boolean not null default false,
  is_full_snapshot   boolean not null default true,  -- feed lists every live record each run
  schedule_cron      text,                     -- UTC cron expression; null = manual only
  min_keep_ratio     numeric(3, 2) not null default 0.80
                       check (min_keep_ratio between 0 and 1),
  config             jsonb not null default '{}'::jsonb,
  http_etag          text,
  http_last_modified text,
  last_run_id        bigint,
  last_success_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on column atlas.sources.min_keep_ratio is
  'Removal guard: a full-snapshot run that sees fewer than ratio x previously-active rows '
  'does not soft-delete anything and ends as partial.';

create trigger sources_touch before update on atlas.sources
  for each row execute function atlas.touch_updated_at();

create table atlas.admin_areas (
  code        text primary key,   -- MOI codes: city 5 digits (68000), district 8 digits (68000020)
  level       text not null check (level in ('city', 'district')),
  parent_code text references atlas.admin_areas (code),
  name        jsonb not null,
  sort        smallint not null default 100,
  check ((level = 'city') = (parent_code is null))
);
create index admin_areas_parent_idx on atlas.admin_areas (parent_code);
create index admin_areas_name_zh_idx on atlas.admin_areas ((atlas.norm_zh(name ->> 'zh-Hant')));

create table atlas.categories (
  slug       text primary key check (slug ~ '^[a-z0-9-]+$'),
  name       jsonb not null,
  icon       text,                                   -- emoji, as in the original web app
  applies_to text[] not null default '{place}'
               check (applies_to <@ array['place', 'event']::text[] and cardinality(applies_to) > 0),
  sort       smallint not null default 100
);

-- Maps source-native category codes to app category slugs (many-to-many).
create table atlas.category_mappings (
  source        text not null references atlas.sources (id) on delete cascade,
  source_code   text not null,
  category_slug text not null references atlas.categories (slug) on delete cascade,
  primary key (source, source_code, category_slug)
);

-- ---------------------------------------------------------------------------
-- Ingestion audit
-- ---------------------------------------------------------------------------

create table atlas.ingestion_runs (
  id                bigint generated always as identity primary key,
  source            text not null references atlas.sources (id),
  trigger           text not null check (trigger in ('cron', 'manual', 'cli', 'test')),
  status            text not null default 'running'
                      check (status in ('running', 'succeeded', 'partial', 'failed', 'skipped', 'abandoned')),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  code_version      text,
  http_requests     integer not null default 0,
  records_fetched   integer not null default 0,
  records_inserted  integer not null default 0,
  records_updated   integer not null default 0,
  records_unchanged integer not null default 0,
  records_failed    integer not null default 0,
  records_removed   integer not null default 0,
  records_restored  integer not null default 0,
  error_class       text check (error_class in
                      ('network', 'http_4xx', 'http_5xx', 'blocked', 'parse', 'validation',
                       'db', 'timeout', 'guard', 'not_modified', 'unknown')),
  error_message     text,
  details           jsonb not null default '{}'::jsonb
);
-- At most one running run per source: doubles as the concurrency lock.
create unique index ingestion_runs_one_running_idx
  on atlas.ingestion_runs (source) where status = 'running';
create index ingestion_runs_source_started_idx
  on atlas.ingestion_runs (source, started_at desc);

create table atlas.ingestion_errors (
  id               bigint generated always as identity primary key,
  run_id           bigint not null references atlas.ingestion_runs (id) on delete cascade,
  stage            text not null check (stage in ('fetch', 'parse', 'normalize', 'upsert', 'finalize')),
  source_record_id text,
  message          text not null,
  context          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index ingestion_errors_run_idx on atlas.ingestion_errors (run_id);

-- ---------------------------------------------------------------------------
-- Places (attractions)
-- ---------------------------------------------------------------------------

create table atlas.places (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null references atlas.sources (id),
  source_id          text not null,
  name               jsonb not null check (jsonb_typeof(name) = 'object' and name <> '{}'::jsonb),
  alt_names          text[] not null default '{}',
  description        jsonb not null default '{}'::jsonb check (jsonb_typeof(description) = 'object'),
  address            jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  postal_code        text,
  city_code          text references atlas.admin_areas (code),
  district_code      text references atlas.admin_areas (code),
  location           geography(point, 4326),
  phone              text,
  website_url        text,
  booking_url        text,
  source_url         text,
  source_categories  text[] not null default '{}',   -- raw source codes, e.g. TA AttractionClass
  category_slugs     text[] not null default '{}',   -- derived via category_mappings
  tags               text[] not null default '{}',   -- raw source tags (usually zh-Hant)
  kid_tags           text[] not null default '{}',   -- fixed vocabulary, see docs/api-contract.md
  kid_score          smallint not null default 0 check (kid_score between 0 and 100),
  is_kid_friendly    boolean generated always as (kid_score >= 50) stored,
  age_min            smallint check (age_min between 0 and 18),
  age_max            smallint check (age_max between 0 and 18),
  indoor_outdoor     text check (indoor_outdoor in ('indoor', 'outdoor', 'mixed')),
  is_free            boolean,
  price_level        smallint check (price_level between 0 and 3),  -- 0 free,1 NT$1-200,2 200-600,3 600+
  fee_text           jsonb not null default '{}'::jsonb,
  opening_hours      jsonb,                                          -- normalised periods, see docs
  opening_hours_text jsonb not null default '{}'::jsonb,
  facilities         text[] not null default '{}',
  images             jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  service_status     text not null default 'open'
                       check (service_status in ('open', 'temporarily_closed', 'permanently_closed', 'unknown')),
  linked_place_id    uuid references atlas.places (id) on delete set null,  -- curated -> official record
  duplicate_of       uuid references atlas.places (id) on delete set null,  -- hidden from lists when set
  duplicate_reason   text check (duplicate_reason in ('curated_link', 'auto_dedupe', 'manual')),
  source_updated_at  timestamptz,
  raw                jsonb,
  content_hash       text not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  last_seen_run_id   bigint,
  removed_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  search_text        text generated always as (
                       lower(coalesce(name ->> 'en', '') || ' ' || coalesce(name ->> 'zh-Hant', '') || ' ' ||
                             coalesce(name ->> 'zh-Hans', '') || ' ' || coalesce(name ->> 'ja', '') || ' ' ||
                             coalesce(name ->> 'ko', ''))
                     ) stored,
  constraint places_source_key unique (source, source_id),           -- idempotent upsert key
  constraint places_age_order check (age_min is null or age_max is null or age_min <= age_max)
);

create index places_location_idx on atlas.places using gist (location);
create index places_category_slugs_idx on atlas.places using gin (category_slugs);
create index places_kid_tags_idx on atlas.places using gin (kid_tags);
create index places_area_idx on atlas.places (city_code, district_code);
create index places_active_kid_idx on atlas.places (kid_score desc) where removed_at is null and duplicate_of is null;
create index places_search_trgm_idx on atlas.places using gin (search_text gin_trgm_ops);
create index places_source_seen_idx on atlas.places (source, last_seen_run_id);

create trigger places_touch before update on atlas.places
  for each row
  when (old.content_hash is distinct from new.content_hash
        or old.duplicate_of is distinct from new.duplicate_of
        or old.linked_place_id is distinct from new.linked_place_id
        or old.removed_at is distinct from new.removed_at)
  execute function atlas.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Events and their occurrences
-- ---------------------------------------------------------------------------

create table atlas.events (
  id                uuid primary key default gen_random_uuid(),
  source            text not null references atlas.sources (id),
  source_id         text not null,
  name              jsonb not null check (jsonb_typeof(name) = 'object' and name <> '{}'::jsonb),
  description       jsonb not null default '{}'::jsonb check (jsonb_typeof(description) = 'object'),
  source_categories text[] not null default '{}',
  category_slugs    text[] not null default '{}',
  tags              text[] not null default '{}',
  kid_tags          text[] not null default '{}',
  kid_score         smallint not null default 0 check (kid_score between 0 and 100),
  is_kid_friendly   boolean generated always as (kid_score >= 50) stored,
  age_min           smallint check (age_min between 0 and 18),
  age_max           smallint check (age_max between 0 and 18),
  starts_at         timestamptz,           -- summary: earliest occurrence start
  ends_at           timestamptz,           -- summary: latest occurrence end
  status            text not null default 'scheduled'
                      check (status in ('scheduled', 'cancelled', 'postponed', 'rescheduled')),
  is_free           boolean,
  price_text        jsonb not null default '{}'::jsonb,
  organizer         jsonb not null default '{}'::jsonb,
  website_url       text,
  ticket_url        text,
  source_url        text,
  images            jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  place_id          uuid references atlas.places (id) on delete set null,
  venue_name        jsonb not null default '{}'::jsonb,   -- primary venue (first occurrence)
  address           jsonb not null default '{}'::jsonb,
  city_code         text references atlas.admin_areas (code),
  district_code     text references atlas.admin_areas (code),
  location          geography(point, 4326),
  source_updated_at timestamptz,
  raw               jsonb,
  content_hash      text not null,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  last_seen_run_id  bigint,
  removed_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  search_text       text generated always as (
                      lower(coalesce(name ->> 'en', '') || ' ' || coalesce(name ->> 'zh-Hant', '') || ' ' ||
                            coalesce(name ->> 'zh-Hans', '') || ' ' || coalesce(name ->> 'ja', '') || ' ' ||
                            coalesce(name ->> 'ko', ''))
                    ) stored,
  constraint events_source_key unique (source, source_id),
  constraint events_age_order check (age_min is null or age_max is null or age_min <= age_max)
);

create index events_range_idx on atlas.events (starts_at, ends_at) where removed_at is null;
create index events_category_slugs_idx on atlas.events using gin (category_slugs);
create index events_location_idx on atlas.events using gist (location);
create index events_search_trgm_idx on atlas.events using gin (search_text gin_trgm_ops);
create index events_source_seen_idx on atlas.events (source, last_seen_run_id);

create trigger events_touch before update on atlas.events
  for each row
  when (old.content_hash is distinct from new.content_hash
        or old.removed_at is distinct from new.removed_at)
  execute function atlas.touch_updated_at();

create table atlas.event_occurrences (
  id            bigint generated always as identity primary key,
  event_id      uuid not null references atlas.events (id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  venue_name    jsonb not null default '{}'::jsonb,
  address       jsonb not null default '{}'::jsonb,
  city_code     text references atlas.admin_areas (code),
  district_code text references atlas.admin_areas (code),
  location      geography(point, 4326),
  price_text    jsonb not null default '{}'::jsonb,
  ticket_url    text,
  constraint occurrence_order check (ends_at is null or ends_at >= starts_at)
);
create index event_occurrences_event_idx on atlas.event_occurrences (event_id, starts_at);
create index event_occurrences_time_idx on atlas.event_occurrences (starts_at, ends_at);
create index event_occurrences_location_idx on atlas.event_occurrences using gist (location);
create index event_occurrences_area_idx on atlas.event_occurrences (city_code, district_code);
