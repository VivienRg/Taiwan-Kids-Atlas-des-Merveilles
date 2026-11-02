-- Taiwan Kids Atlas — migration 0500: public read API (PostgREST RPC)
-- Contract: docs/api-contract.md. All functions are STABLE (callable with GET), SECURITY INVOKER
-- (anon reads are filtered by RLS, migration 0600) and resolve i18n server-side with fallback.
-- Pagination: page_size (1..100, map: 1..1000) + page_offset; every row carries total_count.
-- Parameter names avoid PostgREST reserved query keys (select, order, limit, offset, and, or, not).

set search_path = public, extensions;

create or replace function public.places_search(
  lang         text             default 'en',
  q            text             default null,
  categories   text[]           default null,
  city         text             default null,
  district     text             default null,
  kid_friendly boolean          default null,
  lat          double precision default null,
  lng          double precision default null,
  radius_m     integer          default null,
  sort         text             default null,   -- distance | name | kid_score | recent
  page_size    integer          default 20,
  page_offset  integer          default 0
)
returns table (
  id              uuid,
  source          text,
  name            text,
  name_lang       text,
  city_code       text,
  city_name       text,
  district_code   text,
  district_name   text,
  primary_category text,
  category_slugs  text[],
  kid_tags        text[],
  kid_score       smallint,
  is_kid_friendly boolean,
  age_min         smallint,
  age_max         smallint,
  indoor_outdoor  text,
  is_free         boolean,
  price_level     smallint,
  lat             double precision,
  lng             double precision,
  distance_m      double precision,
  thumbnail_url   text,
  updated_at      timestamptz,
  total_count     bigint
)
language sql
stable
security invoker
set search_path = atlas, extensions, public, pg_temp
as $$
  with prm as (
    select
      case when places_search.lat is not null and places_search.lng is not null
           then st_setsrid(st_makepoint(places_search.lng, places_search.lat), 4326)::geography end as origin,
      least(greatest(coalesce(places_search.page_size, 20), 1), 100)  as lim,
      greatest(coalesce(places_search.page_offset, 0), 0)             as off,
      nullif(btrim(lower(places_search.q)), '')                       as qq,
      coalesce(nullif(places_search.lang, ''), 'en')                  as lg
  ), opt as (
    select prm.*,
           case
             when places_search.sort in ('distance', 'name', 'kid_score', 'recent')
                  and not (places_search.sort = 'distance' and prm.origin is null)
               then places_search.sort
             when prm.origin is not null then 'distance'
             else 'kid_score'
           end as srt
      from prm
  ), base as (
    select p.*,
           case when opt.origin is not null and p.location is not null
                then st_distance(p.location, opt.origin) end as dist,
           opt.srt, opt.lg
      from atlas.places p
      cross join opt
     where p.removed_at is null
       and p.duplicate_of is null
       and p.service_status <> 'permanently_closed'
       and (places_search.categories is null or cardinality(places_search.categories) = 0
            or p.category_slugs && places_search.categories)
       and (places_search.city is null or p.city_code = places_search.city)
       and (places_search.district is null or p.district_code = places_search.district)
       and (places_search.kid_friendly is null or p.is_kid_friendly = places_search.kid_friendly)
       and (opt.qq is null
            or p.search_text like '%' || replace(replace(replace(opt.qq, '\', '\\'), '%', '\%'), '_', '\_') || '%'
            or p.alt_names::text ilike '%' || opt.qq || '%')
       and (places_search.radius_m is null or opt.origin is null
            or st_dwithin(p.location, opt.origin, places_search.radius_m))
  )
  select
    b.id,
    b.source,
    atlas.t(b.name, b.lg),
    atlas.pick_lang(b.name, b.lg),
    b.city_code,
    atlas.t(c.name, b.lg),
    b.district_code,
    atlas.t(d.name, b.lg),
    (select cat.slug from atlas.categories cat
      where cat.slug = any (b.category_slugs) order by cat.sort limit 1),
    b.category_slugs,
    b.kid_tags,
    b.kid_score,
    b.is_kid_friendly,
    b.age_min,
    b.age_max,
    b.indoor_outdoor,
    b.is_free,
    b.price_level,
    st_y(b.location::geometry),
    st_x(b.location::geometry),
    round(b.dist::numeric, 0)::double precision,
    b.images -> 0 ->> 'url',
    b.updated_at,
    count(*) over ()
  from base b
  left join atlas.admin_areas c on c.code = b.city_code
  left join atlas.admin_areas d on d.code = b.district_code
  order by
    case when b.srt = 'distance' then b.dist end asc nulls last,
    case when b.srt = 'name' then atlas.t(b.name, b.lg) end asc,
    case when b.srt = 'kid_score' then b.kid_score end desc,
    case when b.srt = 'recent' then b.updated_at end desc,
    b.kid_score desc,
    b.id
  limit (select lim from prm)
  offset (select off from prm);
$$;

create or replace function public.place_detail(id uuid, lang text default 'en')
returns json
language sql
stable
security invoker
set search_path = atlas, extensions, public, pg_temp
as $$
  select json_build_object(
    'id',                 p.id,
    'canonical_id',       coalesce(p.duplicate_of, p.id),   -- differs when this record is hidden as a duplicate
    'source',             p.source,
    'source_id',          p.source_id,
    'name',               atlas.t(p.name, lg.v),
    'name_lang',          atlas.pick_lang(p.name, lg.v),
    'names',              p.name,
    'alt_names',          p.alt_names,
    'description',        atlas.t(p.description, lg.v),
    'description_lang',   atlas.pick_lang(p.description, lg.v),
    'address',            atlas.t(p.address, lg.v),
    'postal_code',        p.postal_code,
    'city',               case when c.code is null then null
                               else json_build_object('code', c.code, 'name', atlas.t(c.name, lg.v)) end,
    'district',           case when d.code is null then null
                               else json_build_object('code', d.code, 'name', atlas.t(d.name, lg.v)) end,
    'location',           case when p.location is null then null
                               else json_build_object('lat', st_y(p.location::geometry),
                                                      'lng', st_x(p.location::geometry)) end,
    'phone',              p.phone,
    'website_url',        p.website_url,
    'booking_url',        p.booking_url,
    'categories',         coalesce((select json_agg(json_build_object(
                                       'slug', cat.slug, 'name', atlas.t(cat.name, lg.v), 'icon', cat.icon)
                                       order by cat.sort)
                                     from atlas.categories cat
                                    where cat.slug = any (p.category_slugs)), '[]'::json),
    'kid_tags',           p.kid_tags,
    'kid_score',          p.kid_score,
    'is_kid_friendly',    p.is_kid_friendly,
    'age_min',            p.age_min,
    'age_max',            p.age_max,
    'indoor_outdoor',     p.indoor_outdoor,
    'is_free',            p.is_free,
    'price_level',        p.price_level,
    'fee_text',           atlas.t(p.fee_text, lg.v),
    'opening_hours',      p.opening_hours,
    'opening_hours_text', atlas.t(p.opening_hours_text, lg.v),
    'facilities',         p.facilities,
    'images',             coalesce((select json_agg(json_build_object(
                                       'url', i ->> 'url',
                                       'caption', atlas.t(i -> 'caption', lg.v),
                                       'credit', i ->> 'credit') order by n)
                                     from jsonb_array_elements(p.images) with ordinality as im(i, n)
                                    where i ->> 'url' like 'https://%'), '[]'::json),
    'service_status',     p.service_status,
    'source_url',         p.source_url,
    'source_updated_at',  p.source_updated_at,
    'updated_at',         p.updated_at,
    'attribution',        json_build_object(
                            'source_name', atlas.t(s.name, lg.v),
                            'publisher',   atlas.t(s.publisher, lg.v),
                            'license',     s.license,
                            'license_url', s.license_url,
                            'dataset_url', s.homepage_url,
                            'text',        atlas.t(s.attribution, lg.v)),
    'upcoming_events',    coalesce((select json_agg(json_build_object(
                                       'id', e.id, 'name', atlas.t(e.name, lg.v),
                                       'starts_at', e.starts_at, 'ends_at', e.ends_at) order by e.starts_at)
                                     from (select * from atlas.events e
                                            where e.place_id = p.id and e.removed_at is null
                                              and coalesce(e.ends_at, e.starts_at) >= now()
                                            order by e.starts_at limit 5) e), '[]'::json)
  )
  from atlas.places p
  cross join (select coalesce(nullif(place_detail.lang, ''), 'en') as v) lg
  join atlas.sources s on s.id = p.source
  left join atlas.admin_areas c on c.code = p.city_code
  left join atlas.admin_areas d on d.code = p.district_code
  where p.id = place_detail.id
    and p.removed_at is null;
$$;

create or replace function public.places_map(
  min_lat      double precision,
  min_lng      double precision,
  max_lat      double precision,
  max_lng      double precision,
  lang         text    default 'en',
  categories   text[]  default null,
  kid_friendly boolean default null,
  page_size    integer default 500
)
returns table (
  id               uuid,
  name             text,
  lat              double precision,
  lng              double precision,
  primary_category text,
  icon             text,
  kid_score        smallint,
  is_kid_friendly  boolean,
  total_count      bigint
)
language sql
stable
security invoker
set search_path = atlas, extensions, public, pg_temp
as $$
  with b as (
    select p.*,
           (select cat.slug from atlas.categories cat
             where cat.slug = any (p.category_slugs) order by cat.sort limit 1) as pc
      from atlas.places p
     where p.removed_at is null
       and p.duplicate_of is null
       and p.service_status <> 'permanently_closed'
       and p.location is not null
       and p.location && st_makeenvelope(places_map.min_lng, places_map.min_lat,
                                          places_map.max_lng, places_map.max_lat, 4326)::geography
       and (places_map.categories is null or cardinality(places_map.categories) = 0
            or p.category_slugs && places_map.categories)
       and (places_map.kid_friendly is null or p.is_kid_friendly = places_map.kid_friendly)
  )
  select b.id,
         atlas.t(b.name, coalesce(nullif(places_map.lang, ''), 'en')),
         st_y(b.location::geometry),
         st_x(b.location::geometry),
         b.pc,
         (select cat.icon from atlas.categories cat where cat.slug = b.pc),
         b.kid_score,
         b.is_kid_friendly,
         count(*) over ()
    from b
   order by b.kid_score desc, b.id
   limit least(greatest(coalesce(places_map.page_size, 500), 1), 1000);
$$;

create or replace function public.events_search(
  lang         text             default 'en',
  q            text             default null,
  categories   text[]           default null,
  city         text             default null,
  district     text             default null,
  kid_friendly boolean          default null,
  date_from    date             default null,   -- default: today (Asia/Taipei)
  date_to      date             default null,   -- default: date_from + 60 days
  lat          double precision default null,
  lng          double precision default null,
  radius_m     integer          default null,
  sort         text             default null,   -- date | distance
  page_size    integer          default 20,
  page_offset  integer          default 0
)
returns table (
  id              uuid,
  source          text,
  name            text,
  name_lang       text,
  status          text,
  category_slugs  text[],
  primary_category text,
  kid_tags        text[],
  kid_score       smallint,
  is_kid_friendly boolean,
  is_free         boolean,
  next_starts_at  timestamptz,
  next_ends_at    timestamptz,
  occurrence_count bigint,
  venue_name      text,
  city_code       text,
  city_name       text,
  district_code   text,
  district_name   text,
  lat             double precision,
  lng             double precision,
  distance_m      double precision,
  thumbnail_url   text,
  total_count     bigint
)
language sql
stable
security invoker
set search_path = atlas, extensions, public, pg_temp
as $$
  with prm as (
    select
      coalesce(nullif(events_search.lang, ''), 'en') as lg,
      coalesce(events_search.date_from, (now() at time zone 'Asia/Taipei')::date) as d_from,
      case when events_search.lat is not null and events_search.lng is not null
           then st_setsrid(st_makepoint(events_search.lng, events_search.lat), 4326)::geography end as origin,
      nullif(btrim(lower(events_search.q)), '') as qq,
      least(greatest(coalesce(events_search.page_size, 20), 1), 100) as lim,
      greatest(coalesce(events_search.page_offset, 0), 0) as off
  ), win as (
    select prm.*,
           (prm.d_from::timestamp at time zone 'Asia/Taipei') as t_from,
           ((coalesce(events_search.date_to, prm.d_from + 60) + 1)::timestamp at time zone 'Asia/Taipei') as t_to,
           case when events_search.sort = 'distance' and prm.origin is not null then 'distance' else 'date' end as srt
      from prm
  ), occ as (                      -- matching occurrences, best one per event
    select distinct on (o.event_id)
           o.event_id, o.starts_at, o.ends_at, o.venue_name, o.city_code, o.district_code, o.location,
           case when w.origin is not null and o.location is not null then st_distance(o.location, w.origin) end as dist,
           count(*) over (partition by o.event_id) as n
      from atlas.event_occurrences o
      cross join win w
     where o.starts_at < w.t_to
       and coalesce(o.ends_at, o.starts_at) >= w.t_from
       and (events_search.city is null or o.city_code = events_search.city)
       and (events_search.district is null or o.district_code = events_search.district)
       and (events_search.radius_m is null or w.origin is null
            or st_dwithin(o.location, w.origin, events_search.radius_m))
     order by o.event_id,
              case when w.srt = 'distance' then st_distance(o.location, w.origin) end asc nulls last,
              o.starts_at
  ), base as (
    select e.*, occ.starts_at as o_start, occ.ends_at as o_end, occ.venue_name as o_venue,
           occ.city_code as o_city, occ.district_code as o_district, occ.location as o_loc,
           occ.dist, occ.n, w.lg, w.srt
      from atlas.events e
      join occ on occ.event_id = e.id
      cross join win w
     where e.removed_at is null
       and (events_search.categories is null or cardinality(events_search.categories) = 0
            or e.category_slugs && events_search.categories)
       and (events_search.kid_friendly is null or e.is_kid_friendly = events_search.kid_friendly)
       and (w.qq is null
            or e.search_text like '%' || replace(replace(replace(w.qq, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  )
  select
    b.id, b.source,
    atlas.t(b.name, b.lg), atlas.pick_lang(b.name, b.lg),
    b.status, b.category_slugs,
    (select cat.slug from atlas.categories cat where cat.slug = any (b.category_slugs) order by cat.sort limit 1),
    b.kid_tags, b.kid_score, b.is_kid_friendly, b.is_free,
    b.o_start, b.o_end, b.n,
    atlas.t(b.o_venue, b.lg),
    b.o_city, atlas.t(c.name, b.lg),
    b.o_district, atlas.t(d.name, b.lg),
    st_y(coalesce(b.o_loc, b.location)::geometry), st_x(coalesce(b.o_loc, b.location)::geometry),
    round(b.dist::numeric, 0)::double precision,
    b.images -> 0 ->> 'url',
    count(*) over ()
  from base b
  left join atlas.admin_areas c on c.code = b.o_city
  left join atlas.admin_areas d on d.code = b.o_district
  order by
    case when b.srt = 'distance' then b.dist end asc nulls last,
    b.o_start asc,
    b.id
  limit (select lim from prm)
  offset (select off from prm);
$$;

create or replace function public.event_detail(id uuid, lang text default 'en')
returns json
language sql
stable
security invoker
set search_path = atlas, extensions, public, pg_temp
as $$
  select json_build_object(
    'id',               e.id,
    'source',           e.source,
    'source_id',        e.source_id,
    'name',             atlas.t(e.name, lg.v),
    'name_lang',        atlas.pick_lang(e.name, lg.v),
    'names',            e.name,
    'description',      atlas.t(e.description, lg.v),
    'description_lang', atlas.pick_lang(e.description, lg.v),
    'status',           e.status,
    'categories',       coalesce((select json_agg(json_build_object(
                                     'slug', cat.slug, 'name', atlas.t(cat.name, lg.v), 'icon', cat.icon)
                                     order by cat.sort)
                                   from atlas.categories cat where cat.slug = any (e.category_slugs)), '[]'::json),
    'kid_tags',         e.kid_tags,
    'kid_score',        e.kid_score,
    'is_kid_friendly',  e.is_kid_friendly,
    'age_min',          e.age_min,
    'age_max',          e.age_max,
    'starts_at',        e.starts_at,
    'ends_at',          e.ends_at,
    'is_free',          e.is_free,
    'price_text',       atlas.t(e.price_text, lg.v),
    'organizer',        atlas.t(e.organizer, lg.v),
    'website_url',      e.website_url,
    'ticket_url',       e.ticket_url,
    'source_url',       e.source_url,
    'place_id',         e.place_id,
    'images',           coalesce((select json_agg(json_build_object(
                                     'url', i ->> 'url',
                                     'caption', atlas.t(i -> 'caption', lg.v),
                                     'credit', i ->> 'credit') order by n)
                                   from jsonb_array_elements(e.images) with ordinality as im(i, n)
                                  where i ->> 'url' like 'https://%'), '[]'::json),
    'occurrences',      coalesce((select json_agg(json_build_object(
                                     'starts_at',  o.starts_at,
                                     'ends_at',    o.ends_at,
                                     'venue_name', atlas.t(o.venue_name, lg.v),
                                     'address',    atlas.t(o.address, lg.v),
                                     'city',       case when oc.code is null then null else
                                                     json_build_object('code', oc.code, 'name', atlas.t(oc.name, lg.v)) end,
                                     'district',   case when od.code is null then null else
                                                     json_build_object('code', od.code, 'name', atlas.t(od.name, lg.v)) end,
                                     'location',   case when o.location is null then null else
                                                     json_build_object('lat', st_y(o.location::geometry),
                                                                       'lng', st_x(o.location::geometry)) end,
                                     'price_text', atlas.t(o.price_text, lg.v),
                                     'ticket_url', o.ticket_url) order by o.starts_at)
                                   from atlas.event_occurrences o
                                   left join atlas.admin_areas oc on oc.code = o.city_code
                                   left join atlas.admin_areas od on od.code = o.district_code
                                  where o.event_id = e.id
                                    and coalesce(o.ends_at, o.starts_at) >= now() - interval '30 days'), '[]'::json),
    'updated_at',       e.updated_at,
    'attribution',      json_build_object(
                          'source_name', atlas.t(s.name, lg.v),
                          'publisher',   atlas.t(s.publisher, lg.v),
                          'license',     s.license,
                          'license_url', s.license_url,
                          'dataset_url', s.homepage_url,
                          'text',        atlas.t(s.attribution, lg.v))
  )
  from atlas.events e
  cross join (select coalesce(nullif(event_detail.lang, ''), 'en') as v) lg
  join atlas.sources s on s.id = e.source
  where e.id = event_detail.id
    and e.removed_at is null;
$$;

create or replace function public.categories_list(lang text default 'en', kind text default 'place')
returns table (slug text, name text, icon text, sort smallint, item_count bigint)
language sql
stable
security invoker
set search_path = atlas, public, pg_temp
as $$
  select c.slug,
         atlas.t(c.name, coalesce(nullif(categories_list.lang, ''), 'en')),
         c.icon,
         c.sort,
         case when categories_list.kind = 'event' then
           (select count(*) from atlas.events e
             where e.removed_at is null and c.slug = any (e.category_slugs)
               and coalesce(e.ends_at, e.starts_at) >= now())
         else
           (select count(*) from atlas.places p
             where p.removed_at is null and p.duplicate_of is null
               and p.service_status <> 'permanently_closed' and c.slug = any (p.category_slugs))
         end
    from atlas.categories c
   where coalesce(nullif(categories_list.kind, ''), 'place') = any (c.applies_to)
   order by c.sort, c.slug;
$$;

create or replace function public.areas_list(lang text default 'en', parent text default null)
returns table (code text, level text, parent_code text, name text, name_lang text, place_count bigint)
language sql
stable
security invoker
set search_path = atlas, public, pg_temp
as $$
  select a.code, a.level, a.parent_code,
         atlas.t(a.name, coalesce(nullif(areas_list.lang, ''), 'en')),
         atlas.pick_lang(a.name, coalesce(nullif(areas_list.lang, ''), 'en')),
         cnt.n
    from atlas.admin_areas a
    cross join lateral (
      select count(*) as n
        from atlas.places p
       where p.removed_at is null and p.duplicate_of is null
         and p.service_status <> 'permanently_closed'
         and (case when a.level = 'city' then p.city_code else p.district_code end) = a.code
    ) cnt
   where (areas_list.parent is null and a.level = 'city')
      or (areas_list.parent is not null and a.parent_code = areas_list.parent)
   order by a.sort, a.code;
$$;

create or replace function public.app_meta(lang text default 'en')
returns json
language sql
stable
security invoker
set search_path = atlas, public, pg_temp
as $$
  select json_build_object(
    'api_version',   '1.0',
    'generated_at',  now(),
    'content_languages', array['zh-Hant', 'en', 'ja', 'ko', 'zh-Hans'],
    'sources', coalesce((select json_agg(json_build_object(
                  'id',              s.id,
                  'kind',            s.kind,
                  'name',            atlas.t(s.name, lg.v),
                  'publisher',       atlas.t(s.publisher, lg.v),
                  'license',         s.license,
                  'license_url',     s.license_url,
                  'dataset_url',     s.homepage_url,
                  'attribution',     atlas.t(s.attribution, lg.v),
                  'enabled',         s.enabled,
                  'last_success_at', s.last_success_at) order by s.id)
                 from atlas.sources s), '[]'::json),
    'counts', json_build_object(
      'places',              (select count(*) from atlas.places p
                               where p.removed_at is null and p.duplicate_of is null),
      'kid_friendly_places', (select count(*) from atlas.places p
                               where p.removed_at is null and p.duplicate_of is null and p.is_kid_friendly),
      'upcoming_events',     (select count(*) from atlas.events e
                               where e.removed_at is null and coalesce(e.ends_at, e.starts_at) >= now()))
  )
  from (select coalesce(nullif(app_meta.lang, ''), 'en') as v) lg;
$$;
