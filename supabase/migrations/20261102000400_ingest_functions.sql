-- Taiwan Kids Atlas — migration 0400: ingestion functions
-- The ingestion worker (Deno, see docs/ingestion.md) fetches + normalises records, then calls:
--   atlas.start_run(source, trigger, code_version)        -> run_id   (one running run per source)
--   atlas.upsert_places(run_id, rows jsonb[])              -> batch stats (repeat per batch)
--   atlas.upsert_events(run_id, rows jsonb[])              -> batch stats
--   atlas.log_ingestion_error(run_id, stage, record_id, message, context)
--   atlas.finish_run(run_id, status, counters, error_class, error_message, details)
-- Upserts are idempotent on (source, source_id). Unchanged rows (same content_hash) are only
-- "touched" (last_seen_*), so a re-run with identical data writes no content.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Sanitisers used by the upserts
-- ---------------------------------------------------------------------------

-- Keeps only non-blank string values of an i18n object; anything else becomes '{}'.
create or replace function atlas.i18n_clean(p jsonb)
returns jsonb
language sql
immutable
parallel safe
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then '{}'::jsonb
    else coalesce(
      (select jsonb_object_agg(k, to_jsonb(btrim(v #>> '{}')))
         from jsonb_each(p) as e(k, v)
        where jsonb_typeof(v) = 'string' and btrim(v #>> '{}') <> ''),
      '{}'::jsonb)
  end;
$$;

-- JSON array of scalars -> text[] (blank values dropped); anything else -> '{}'.
create or replace function atlas.text_array(p jsonb)
returns text[]
language sql
immutable
parallel safe
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then '{}'::text[]
    else array(
      select btrim(x)
        from jsonb_array_elements_text(p) as x
       where btrim(x) <> '')
  end;
$$;

-- WGS84 point if the coordinates fall inside a generous Taiwan + outlying islands box.
create or replace function atlas.tw_point(p_lat text, p_lng text)
returns geography
language plpgsql
immutable
set search_path = extensions, public, pg_temp
as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  if p_lat is null or p_lng is null then
    return null;
  end if;
  begin
    v_lat := p_lat::double precision;
    v_lng := p_lng::double precision;
  exception when others then
    return null;
  end;
  if v_lat between 20.5 and 26.5 and v_lng between 116.5 and 122.5 then
    return st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography;
  end if;
  return null;
end;
$$;

-- Resolves a city by code, zh-Hant name (台/臺 tolerant) or English name ("Taoyuan" or
-- "Taoyuan City"). A suffix-less English name that matches several cities ("Hsinchu") is ambiguous
-- and resolves to null.
create or replace function atlas.resolve_city(p_code text, p_name text)
returns text
language sql
stable
set search_path = atlas, pg_temp
as $$
  with m as (
    select c.code,
           case
             when c.code = p_code then 1
             when atlas.norm_zh(c.name ->> 'zh-Hant') = atlas.norm_zh(p_name) then 2
             when lower(c.name ->> 'en') = lower(btrim(p_name)) then 3
             when lower(regexp_replace(c.name ->> 'en', ' (City|County)$', ''))
                  = lower(regexp_replace(btrim(p_name), ' (City|County)$', '')) then 4
           end as rank
      from atlas.admin_areas c
     where c.level = 'city'
  )
  select code from m
   where rank is not null
     and (rank < 4 or (select count(*) from m where rank = 4) = 1)
   order by rank
   limit 1;
$$;

-- Resolves a district inside a city by code, zh-Hant name, or English name with/without " District".
create or replace function atlas.resolve_district(p_city text, p_code text, p_name text)
returns text
language sql
stable
set search_path = atlas, pg_temp
as $$
  select d.code
    from atlas.admin_areas d
   where d.level = 'district'
     and d.parent_code = p_city
     and (d.code = p_code
          or atlas.norm_zh(d.name ->> 'zh-Hant') = atlas.norm_zh(p_name)
          or lower(regexp_replace(d.name ->> 'en', ' District$', ''))
             = lower(regexp_replace(btrim(p_name), ' District$', '')))
   order by (d.code = p_code) desc nulls last
   limit 1;
$$;

-- Registers districts carried by source rows (code + zh-Hant name), e.g. TA TownCode/Town.
create or replace function atlas.register_districts(p_rows jsonb)
returns integer
language sql
set search_path = atlas, pg_temp
as $$
  with candidates as (
    select r ->> 'district_code' as code,
           atlas.resolve_city(r ->> 'city_code', r ->> 'city_name') as city,
           atlas.norm_zh(r ->> 'district_name') as name_zh
      from jsonb_array_elements(p_rows) as r
    union all
    select o ->> 'district_code',
           atlas.resolve_city(o ->> 'city_code', o ->> 'city_name'),
           atlas.norm_zh(o ->> 'district_name')
      from jsonb_array_elements(p_rows) as r,
           jsonb_array_elements(case when jsonb_typeof(r -> 'occurrences') = 'array'
                                     then r -> 'occurrences' else '[]'::jsonb end) as o
  ), ins as (
    insert into atlas.admin_areas (code, level, parent_code, name)
    select distinct on (code) code, 'district', city, jsonb_build_object('zh-Hant', name_zh)
      from candidates
     where code ~ '^[0-9]{8}$' and city is not null and name_zh is not null
       and left(code, length(city)) = city
    on conflict (code) do nothing
    returning 1
  )
  select count(*)::integer from ins;
$$;

-- ---------------------------------------------------------------------------
-- Run lifecycle
-- ---------------------------------------------------------------------------

create or replace function atlas.start_run(
  p_source       text,
  p_trigger      text default 'cron',
  p_code_version text default null
)
returns bigint
language plpgsql
set search_path = atlas, pg_temp
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from atlas.sources where id = p_source) then
    raise exception 'unknown source %', p_source using errcode = '22023';
  end if;

  -- A crashed worker never calls finish_run; free its lock after 2 hours.
  update atlas.ingestion_runs
     set status = 'abandoned', finished_at = now(), error_class = 'timeout',
         error_message = 'run exceeded the 2h stale threshold without finishing'
   where source = p_source and status = 'running' and started_at < now() - interval '2 hours';

  begin
    insert into atlas.ingestion_runs (source, trigger, code_version)
    values (p_source, p_trigger, p_code_version)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'an ingestion run is already in progress for source %', p_source
      using errcode = '55P03';   -- lock_not_available: caller should exit quietly
  end;

  update atlas.sources set last_run_id = v_id where id = p_source;
  return v_id;
end;
$$;

create or replace function atlas.log_ingestion_error(
  p_run_id           bigint,
  p_stage            text,
  p_source_record_id text,
  p_message          text,
  p_context          jsonb default '{}'::jsonb
)
returns void
language sql
set search_path = atlas, pg_temp
as $$
  -- Capped at 500 rows per run so a systematically broken feed cannot flood the table.
  insert into atlas.ingestion_errors (run_id, stage, source_record_id, message, context)
  select p_run_id, p_stage, p_source_record_id, left(p_message, 2000), coalesce(p_context, '{}'::jsonb)
   where (select count(*) from atlas.ingestion_errors where run_id = p_run_id) < 500;
$$;

create or replace function atlas.running_source(p_run_id bigint)
returns text
language plpgsql
stable
set search_path = atlas, pg_temp
as $$
declare
  v_source text;
begin
  select source into v_source from atlas.ingestion_runs where id = p_run_id and status = 'running';
  if v_source is null then
    raise exception 'ingestion run % is not running', p_run_id using errcode = '55000';
  end if;
  return v_source;
end;
$$;

-- ---------------------------------------------------------------------------
-- Places upsert
-- ---------------------------------------------------------------------------

create or replace function atlas.upsert_places(p_run_id bigint, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = atlas, extensions, public, pg_temp
as $$
declare
  v_source  text := atlas.running_source(p_run_id);
  v_stats   jsonb;
  v_invalid integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  perform atlas.register_districts(p_rows);

  -- Rows without a source_id or a usable name are rejected and logged.
  with bad as (
    select r
      from jsonb_array_elements(p_rows) as r
     where coalesce(btrim(r ->> 'source_id'), '') = '' or atlas.i18n_clean(r -> 'name') = '{}'::jsonb
  ), logged as (
    insert into atlas.ingestion_errors (run_id, stage, source_record_id, message, context)
    select p_run_id, 'upsert', r ->> 'source_id', 'row rejected: missing source_id or name',
           jsonb_build_object('row', r - 'raw')
      from bad
    returning 1
  )
  select count(*) into v_invalid from logged;

  with input as (
    select distinct on (r ->> 'source_id') r
      from jsonb_array_elements(p_rows) with ordinality as e(r, ord)
     where coalesce(btrim(r ->> 'source_id'), '') <> ''
       and atlas.i18n_clean(r -> 'name') <> '{}'::jsonb
     order by r ->> 'source_id', ord desc          -- last occurrence in the batch wins
  ),
  prepared as (
    select
      btrim(i.r ->> 'source_id')                              as source_id,
      atlas.i18n_clean(i.r -> 'name')                         as name,
      atlas.text_array(i.r -> 'alt_names')                    as alt_names,
      atlas.i18n_clean(i.r -> 'description')                  as description,
      atlas.i18n_clean(i.r -> 'address')                      as address,
      nullif(btrim(i.r ->> 'postal_code'), '')                as postal_code,
      a.city_code,
      atlas.resolve_district(a.city_code, i.r ->> 'district_code', i.r ->> 'district_name') as district_code,
      atlas.tw_point(i.r ->> 'lat', i.r ->> 'lng')            as location,
      nullif(btrim(i.r ->> 'phone'), '')                      as phone,
      nullif(btrim(i.r ->> 'website_url'), '')                as website_url,
      nullif(btrim(i.r ->> 'booking_url'), '')                as booking_url,
      nullif(btrim(i.r ->> 'source_url'), '')                 as source_url,
      atlas.text_array(i.r -> 'source_categories')            as source_categories,
      cats.slugs                                              as category_slugs,
      atlas.text_array(i.r -> 'tags')                         as tags,
      atlas.text_array(i.r -> 'kid_tags')                     as kid_tags,
      least(greatest(coalesce((i.r ->> 'kid_score')::numeric, 0), 0), 100)::smallint as kid_score,
      (i.r ->> 'age_min')::smallint                           as age_min,
      (i.r ->> 'age_max')::smallint                           as age_max,
      nullif(i.r ->> 'indoor_outdoor', '')                    as indoor_outdoor,
      (i.r ->> 'is_free')::boolean                            as is_free,
      (i.r ->> 'price_level')::smallint                       as price_level,
      atlas.i18n_clean(i.r -> 'fee_text')                     as fee_text,
      case when jsonb_typeof(i.r -> 'opening_hours') = 'object' then i.r -> 'opening_hours' end
                                                              as opening_hours,
      atlas.i18n_clean(i.r -> 'opening_hours_text')           as opening_hours_text,
      atlas.text_array(i.r -> 'facilities')                   as facilities,
      case when jsonb_typeof(i.r -> 'images') = 'array' then i.r -> 'images' else '[]'::jsonb end
                                                              as images,
      coalesce(nullif(i.r ->> 'service_status', ''), 'open')  as service_status,
      (select p.id from atlas.places p
        where p.source = i.r #>> '{linked,source}' and p.source_id = i.r #>> '{linked,source_id}')
                                                              as linked_place_id,
      (i.r ->> 'source_updated_at')::timestamptz              as source_updated_at,
      case when jsonb_typeof(i.r -> 'raw') in ('object', 'array') then i.r -> 'raw' end as raw,
      md5((i.r - 'raw')::text || '|' || cats.slugs::text)     as content_hash
    from input i
    cross join lateral (select atlas.resolve_city(i.r ->> 'city_code', i.r ->> 'city_name') as city_code) a
    cross join lateral (
      select coalesce(array_agg(distinct m.category_slug order by m.category_slug), '{}'::text[]) as slugs
        from atlas.category_mappings m
       where m.source = v_source
         and m.source_code = any (atlas.text_array(i.r -> 'source_categories'))
    ) cats
  ),
  old as (
    select p.source_id, p.content_hash, p.removed_at
      from atlas.places p
      join prepared x on p.source = v_source and p.source_id = x.source_id
  ),
  touched as (                       -- identical content: only mark as seen
    update atlas.places p
       set last_seen_at = now(), last_seen_run_id = p_run_id, removed_at = null
      from prepared x
     where p.source = v_source and p.source_id = x.source_id and p.content_hash = x.content_hash
    returning p.source_id
  ),
  written as (                       -- new or changed content
    insert into atlas.places as p (
      source, source_id, name, alt_names, description, address, postal_code, city_code, district_code,
      location, phone, website_url, booking_url, source_url, source_categories, category_slugs, tags,
      kid_tags, kid_score, age_min, age_max, indoor_outdoor, is_free, price_level, fee_text,
      opening_hours, opening_hours_text, facilities, images, service_status, linked_place_id,
      source_updated_at, raw, content_hash, last_seen_at, last_seen_run_id)
    select
      v_source, x.source_id, x.name, x.alt_names, x.description, x.address, x.postal_code, x.city_code,
      x.district_code, x.location, x.phone, x.website_url, x.booking_url, x.source_url,
      x.source_categories, x.category_slugs, x.tags, x.kid_tags, x.kid_score, x.age_min, x.age_max,
      x.indoor_outdoor, x.is_free, x.price_level, x.fee_text, x.opening_hours, x.opening_hours_text,
      x.facilities, x.images, x.service_status, x.linked_place_id, x.source_updated_at, x.raw,
      x.content_hash, now(), p_run_id
    from prepared x
    where not exists (select 1 from old o where o.source_id = x.source_id and o.content_hash = x.content_hash)
    on conflict (source, source_id) do update set
      name = excluded.name, alt_names = excluded.alt_names, description = excluded.description,
      address = excluded.address, postal_code = excluded.postal_code, city_code = excluded.city_code,
      district_code = excluded.district_code, location = excluded.location, phone = excluded.phone,
      website_url = excluded.website_url, booking_url = excluded.booking_url,
      source_url = excluded.source_url, source_categories = excluded.source_categories,
      category_slugs = excluded.category_slugs, tags = excluded.tags, kid_tags = excluded.kid_tags,
      kid_score = excluded.kid_score, age_min = excluded.age_min, age_max = excluded.age_max,
      indoor_outdoor = excluded.indoor_outdoor, is_free = excluded.is_free,
      price_level = excluded.price_level, fee_text = excluded.fee_text,
      opening_hours = excluded.opening_hours, opening_hours_text = excluded.opening_hours_text,
      facilities = excluded.facilities, images = excluded.images,
      service_status = excluded.service_status, linked_place_id = excluded.linked_place_id,
      source_updated_at = excluded.source_updated_at, raw = excluded.raw,
      content_hash = excluded.content_hash, last_seen_at = excluded.last_seen_at,
      last_seen_run_id = excluded.last_seen_run_id, removed_at = null
    returning p.source_id
  )
  select jsonb_build_object(
    'received',  jsonb_array_length(p_rows),
    'inserted',  (select count(*) from written w where not exists (select 1 from old o where o.source_id = w.source_id)),
    'updated',   (select count(*) from written w join old o using (source_id)),
    'unchanged', (select count(*) from touched),
    'restored',  (select count(*) from old o
                   where o.removed_at is not null
                     and (o.source_id in (select source_id from touched)
                          or o.source_id in (select source_id from written))),
    'failed',    v_invalid)
  into v_stats;

  update atlas.ingestion_runs
     set records_inserted  = records_inserted  + (v_stats ->> 'inserted')::integer,
         records_updated   = records_updated   + (v_stats ->> 'updated')::integer,
         records_unchanged = records_unchanged + (v_stats ->> 'unchanged')::integer,
         records_restored  = records_restored  + (v_stats ->> 'restored')::integer,
         records_failed    = records_failed    + (v_stats ->> 'failed')::integer
   where id = p_run_id;

  return v_stats;
end;
$$;

-- ---------------------------------------------------------------------------
-- Events upsert (event + its occurrences; occurrences are replaced when content changes)
-- ---------------------------------------------------------------------------

create or replace function atlas.upsert_events(p_run_id bigint, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = atlas, extensions, public, pg_temp
as $$
declare
  v_source  text := atlas.running_source(p_run_id);
  v_stats   jsonb;
  v_invalid integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  perform atlas.register_districts(p_rows);

  with bad as (
    select r
      from jsonb_array_elements(p_rows) as r
     where coalesce(btrim(r ->> 'source_id'), '') = ''
        or atlas.i18n_clean(r -> 'name') = '{}'::jsonb
        or jsonb_typeof(r -> 'occurrences') <> 'array'
        or jsonb_array_length(r -> 'occurrences') = 0
  ), logged as (
    insert into atlas.ingestion_errors (run_id, stage, source_record_id, message, context)
    select p_run_id, 'upsert', r ->> 'source_id',
           'row rejected: missing source_id, name or occurrences', jsonb_build_object('row', r - 'raw')
      from bad
    returning 1
  )
  select count(*) into v_invalid from logged;

  create temp table if not exists _atlas_event_batch (
    source_id text primary key, event_id uuid, is_new boolean, was_removed boolean, occurrences jsonb
  ) on commit drop;
  truncate _atlas_event_batch;

  with input as (
    select distinct on (r ->> 'source_id') r
      from jsonb_array_elements(p_rows) with ordinality as e(r, ord)
     where coalesce(btrim(r ->> 'source_id'), '') <> ''
       and atlas.i18n_clean(r -> 'name') <> '{}'::jsonb
       and jsonb_typeof(r -> 'occurrences') = 'array'
       and jsonb_array_length(r -> 'occurrences') > 0
     order by r ->> 'source_id', ord desc
  ),
  prepared as (
    select
      btrim(i.r ->> 'source_id')                            as source_id,
      atlas.i18n_clean(i.r -> 'name')                       as name,
      atlas.i18n_clean(i.r -> 'description')                as description,
      atlas.text_array(i.r -> 'source_categories')          as source_categories,
      cats.slugs                                            as category_slugs,
      atlas.text_array(i.r -> 'tags')                       as tags,
      atlas.text_array(i.r -> 'kid_tags')                   as kid_tags,
      least(greatest(coalesce((i.r ->> 'kid_score')::numeric, 0), 0), 100)::smallint as kid_score,
      (i.r ->> 'age_min')::smallint                         as age_min,
      (i.r ->> 'age_max')::smallint                         as age_max,
      rng.starts_at,
      rng.ends_at,
      coalesce(nullif(i.r ->> 'status', ''), 'scheduled')   as status,
      (i.r ->> 'is_free')::boolean                          as is_free,
      atlas.i18n_clean(i.r -> 'price_text')                 as price_text,
      atlas.i18n_clean(i.r -> 'organizer')                  as organizer,
      nullif(btrim(i.r ->> 'website_url'), '')              as website_url,
      nullif(btrim(i.r ->> 'ticket_url'), '')               as ticket_url,
      nullif(btrim(i.r ->> 'source_url'), '')               as source_url,
      case when jsonb_typeof(i.r -> 'images') = 'array' then i.r -> 'images' else '[]'::jsonb end as images,
      atlas.i18n_clean(coalesce(i.r -> 'venue_name', i.r #> '{occurrences,0,venue_name}')) as venue_name,
      atlas.i18n_clean(coalesce(i.r -> 'address', i.r #> '{occurrences,0,address}'))       as address,
      a.city_code,
      atlas.resolve_district(a.city_code,
        coalesce(i.r ->> 'district_code', i.r #>> '{occurrences,0,district_code}'),
        coalesce(i.r ->> 'district_name', i.r #>> '{occurrences,0,district_name}'))       as district_code,
      atlas.tw_point(coalesce(i.r ->> 'lat', i.r #>> '{occurrences,0,lat}'),
                     coalesce(i.r ->> 'lng', i.r #>> '{occurrences,0,lng}'))              as location,
      (i.r ->> 'source_updated_at')::timestamptz            as source_updated_at,
      case when jsonb_typeof(i.r -> 'raw') in ('object', 'array') then i.r -> 'raw' end as raw,
      i.r -> 'occurrences'                                  as occurrences,
      md5((i.r - 'raw')::text || '|' || cats.slugs::text)   as content_hash
    from input i
    cross join lateral (
      select atlas.resolve_city(coalesce(i.r ->> 'city_code', i.r #>> '{occurrences,0,city_code}'),
                                coalesce(i.r ->> 'city_name', i.r #>> '{occurrences,0,city_name}')) as city_code
    ) a
    cross join lateral (
      select min((o ->> 'starts_at')::timestamptz) as starts_at,
             max(coalesce((o ->> 'ends_at')::timestamptz, (o ->> 'starts_at')::timestamptz)) as ends_at
        from jsonb_array_elements(i.r -> 'occurrences') as o
    ) rng
    cross join lateral (
      select coalesce(array_agg(distinct m.category_slug order by m.category_slug), '{}'::text[]) as slugs
        from atlas.category_mappings m
       where m.source = v_source
         and m.source_code = any (atlas.text_array(i.r -> 'source_categories'))
    ) cats
  ),
  old as (
    select e.id, e.source_id, e.content_hash, e.removed_at
      from atlas.events e
      join prepared x on e.source = v_source and e.source_id = x.source_id
  ),
  touched as (
    update atlas.events e
       set last_seen_at = now(), last_seen_run_id = p_run_id, removed_at = null
      from prepared x
     where e.source = v_source and e.source_id = x.source_id and e.content_hash = x.content_hash
    returning e.source_id
  ),
  written as (
    insert into atlas.events as e (
      source, source_id, name, description, source_categories, category_slugs, tags, kid_tags,
      kid_score, age_min, age_max, starts_at, ends_at, status, is_free, price_text, organizer,
      website_url, ticket_url, source_url, images, venue_name, address, city_code, district_code,
      location, source_updated_at, raw, content_hash, last_seen_at, last_seen_run_id)
    select
      v_source, x.source_id, x.name, x.description, x.source_categories, x.category_slugs, x.tags,
      x.kid_tags, x.kid_score, x.age_min, x.age_max, x.starts_at, x.ends_at, x.status, x.is_free,
      x.price_text, x.organizer, x.website_url, x.ticket_url, x.source_url, x.images, x.venue_name,
      x.address, x.city_code, x.district_code, x.location, x.source_updated_at, x.raw,
      x.content_hash, now(), p_run_id
    from prepared x
    where not exists (select 1 from old o where o.source_id = x.source_id and o.content_hash = x.content_hash)
    on conflict (source, source_id) do update set
      name = excluded.name, description = excluded.description,
      source_categories = excluded.source_categories, category_slugs = excluded.category_slugs,
      tags = excluded.tags, kid_tags = excluded.kid_tags, kid_score = excluded.kid_score,
      age_min = excluded.age_min, age_max = excluded.age_max, starts_at = excluded.starts_at,
      ends_at = excluded.ends_at, status = excluded.status, is_free = excluded.is_free,
      price_text = excluded.price_text, organizer = excluded.organizer,
      website_url = excluded.website_url, ticket_url = excluded.ticket_url,
      source_url = excluded.source_url, images = excluded.images, venue_name = excluded.venue_name,
      address = excluded.address, city_code = excluded.city_code,
      district_code = excluded.district_code, location = excluded.location,
      source_updated_at = excluded.source_updated_at, raw = excluded.raw,
      content_hash = excluded.content_hash, last_seen_at = excluded.last_seen_at,
      last_seen_run_id = excluded.last_seen_run_id, removed_at = null
    returning e.id, e.source_id
  )
  insert into _atlas_event_batch (source_id, event_id, is_new, was_removed, occurrences)
  select w.source_id, w.id, o.source_id is null, o.removed_at is not null,
         (select x.occurrences from prepared x where x.source_id = w.source_id)
    from written w
    left join old o on o.source_id = w.source_id
  union all
  select t.source_id, null, false, o.removed_at is not null, null
    from touched t
    join old o on o.source_id = t.source_id;

  -- Replace occurrences of new/changed events.
  delete from atlas.event_occurrences eo
   using _atlas_event_batch b
   where b.event_id is not null and eo.event_id = b.event_id;

  insert into atlas.event_occurrences (
    event_id, starts_at, ends_at, venue_name, address, city_code, district_code, location,
    price_text, ticket_url)
  select b.event_id,
         (o ->> 'starts_at')::timestamptz,
         (o ->> 'ends_at')::timestamptz,
         atlas.i18n_clean(o -> 'venue_name'),
         atlas.i18n_clean(o -> 'address'),
         c.city_code,
         atlas.resolve_district(c.city_code, o ->> 'district_code', o ->> 'district_name'),
         atlas.tw_point(o ->> 'lat', o ->> 'lng'),
         atlas.i18n_clean(o -> 'price_text'),
         nullif(btrim(o ->> 'ticket_url'), '')
    from _atlas_event_batch b
    cross join lateral jsonb_array_elements(b.occurrences) as o
    cross join lateral (select atlas.resolve_city(o ->> 'city_code', o ->> 'city_name') as city_code) c
   where b.event_id is not null
     and o ->> 'starts_at' is not null;

  select jsonb_build_object(
    'received',  jsonb_array_length(p_rows),
    'inserted',  count(*) filter (where event_id is not null and is_new),
    'updated',   count(*) filter (where event_id is not null and not is_new),
    'unchanged', count(*) filter (where event_id is null),
    'restored',  count(*) filter (where was_removed),
    'failed',    v_invalid)
  into v_stats
  from _atlas_event_batch;

  update atlas.ingestion_runs
     set records_inserted  = records_inserted  + (v_stats ->> 'inserted')::integer,
         records_updated   = records_updated   + (v_stats ->> 'updated')::integer,
         records_unchanged = records_unchanged + (v_stats ->> 'unchanged')::integer,
         records_restored  = records_restored  + (v_stats ->> 'restored')::integer,
         records_failed    = records_failed    + (v_stats ->> 'failed')::integer
   where id = p_run_id;

  return v_stats;
end;
$$;

-- ---------------------------------------------------------------------------
-- Curated <-> official record linking
-- ---------------------------------------------------------------------------

-- A curated place may set linked_place_id to an official record (e.g. a TA attraction).
-- The official record is then hidden from lists (duplicate_of) and the curated record
-- borrows whatever it lacks (coordinates, district, images, zh-Hant description, hours).
create or replace function atlas.refresh_linked_places()
returns integer
language plpgsql
set search_path = atlas, extensions, public, pg_temp
as $$
declare
  v_count integer;
begin
  update atlas.places o
     set duplicate_of = c.id, duplicate_reason = 'curated_link'
    from atlas.places c
   where c.linked_place_id = o.id and c.removed_at is null
     and o.duplicate_of is distinct from c.id
     and o.duplicate_reason is distinct from 'manual';

  update atlas.places o
     set duplicate_of = null, duplicate_reason = null
   where o.duplicate_reason = 'curated_link'
     and not exists (select 1 from atlas.places c
                      where c.id = o.duplicate_of and c.linked_place_id = o.id and c.removed_at is null);

  update atlas.places c
     set name               = o.name || c.name,      -- e.g. adds the official zh-Hant name
         location           = coalesce(c.location, o.location),
         city_code          = coalesce(c.city_code, o.city_code),
         district_code      = coalesce(c.district_code, o.district_code),
         description        = o.description || c.description,
         address            = o.address || c.address,
         images             = case when jsonb_array_length(c.images) = 0 then o.images else c.images end,
         opening_hours      = coalesce(c.opening_hours, o.opening_hours),
         opening_hours_text = o.opening_hours_text || c.opening_hours_text,
         phone              = coalesce(c.phone, o.phone),
         website_url        = coalesce(c.website_url, o.website_url),
         facilities         = case when cardinality(c.facilities) = 0 then o.facilities else c.facilities end
    from atlas.places o
   where c.linked_place_id = o.id and o.removed_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Hides intra/inter-source duplicates of official records: same normalised name (zh-Hant, with a
-- "桃園：" style prefix removed) within p_radius_m metres. The richer record (images, description)
-- wins; ties break on id. Curated rows and manual decisions are never touched. Idempotent: only
-- rows whose decision changes are written.
create or replace function atlas.dedupe_places(p_radius_m integer default 300)
returns integer
language plpgsql
set search_path = atlas, extensions, public, pg_temp
as $$
declare
  v_count integer;
begin
  with cand as (
    select p.id, p.location,
           regexp_replace(atlas.norm_zh(coalesce(p.name ->> 'zh-Hant', p.name ->> 'en')),
                          '^[^：:]{1,6}[：:]\s*', '') as nkey,
           (jsonb_array_length(p.images) > 0)::int * 2 + (p.description <> '{}'::jsonb)::int as richness
      from atlas.places p
     where p.removed_at is null
       and p.source <> 'curated'
       and p.location is not null
       and (p.duplicate_of is null or p.duplicate_reason = 'auto_dedupe')
  ), desired as (
    select distinct on (b.id) b.id as dup_id, a.id as keep_id
      from cand a
      join cand b
        on a.nkey = b.nkey
       and a.id <> b.id
       and (a.richness, b.id::text) > (b.richness, a.id::text)
       and st_dwithin(a.location, b.location, p_radius_m)
     order by b.id, a.richness desc, a.id
  ), cleared as (
    update atlas.places p
       set duplicate_of = null, duplicate_reason = null
     where p.duplicate_reason = 'auto_dedupe'
       and not exists (select 1 from desired d where d.dup_id = p.id)
    returning 1
  ), applied as (
    update atlas.places p
       set duplicate_of = d.keep_id, duplicate_reason = 'auto_dedupe'
      from desired d
     where p.id = d.dup_id
       and p.duplicate_of is distinct from d.keep_id
    returning 1
  )
  select (select count(*) from cleared) + (select count(*) from applied) into v_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finish a run: removal handling (soft delete), counters, source bookkeeping
-- ---------------------------------------------------------------------------

create or replace function atlas.finish_run(
  p_run_id        bigint,
  p_status        text,
  p_counters      jsonb default '{}'::jsonb,   -- {"http_requests":n,"records_fetched":n,"records_failed":n}
  p_error_class   text  default null,
  p_error_message text  default null,
  p_details       jsonb default '{}'::jsonb    -- free-form; {"http":{"etag":..,"last_modified":..}} is persisted
)
returns atlas.ingestion_runs
language plpgsql
set search_path = atlas, extensions, public, pg_temp
as $$
declare
  v_run     atlas.ingestion_runs;
  v_src     atlas.sources;
  v_status  text := p_status;
  v_class   text := p_error_class;
  v_message text := p_error_message;
  v_seen    integer;
  v_active  integer;
  v_removed integer := 0;
begin
  if p_status not in ('succeeded', 'partial', 'failed', 'skipped') then
    raise exception 'invalid final status %', p_status using errcode = '22023';
  end if;

  select * into v_run from atlas.ingestion_runs where id = p_run_id for update;
  if not found or v_run.status <> 'running' then
    raise exception 'ingestion run % is not running', p_run_id using errcode = '55000';
  end if;
  select * into v_src from atlas.sources where id = v_run.source;

  -- Removal handling only after a complete, successful snapshot.
  if v_status = 'succeeded' and v_src.is_full_snapshot then
    if v_src.kind = 'place' then
      select count(*) filter (where last_seen_run_id = p_run_id),
             count(*) filter (where removed_at is null)
        into v_seen, v_active
        from atlas.places where source = v_run.source;
    else
      select count(*) filter (where last_seen_run_id = p_run_id),
             count(*) filter (where removed_at is null)
        into v_seen, v_active
        from atlas.events where source = v_run.source;
    end if;

    if v_seen < v_src.min_keep_ratio * v_active then
      v_status  := 'partial';
      v_class   := coalesce(v_class, 'guard');
      v_message := format('removal guard tripped: run saw %s of %s active records (min_keep_ratio %s); nothing removed',
                          v_seen, v_active, v_src.min_keep_ratio);
    elsif v_src.kind = 'place' then
      update atlas.places
         set removed_at = now()
       where source = v_run.source and removed_at is null
         and last_seen_run_id is distinct from p_run_id;
      get diagnostics v_removed = row_count;
    else
      update atlas.events
         set removed_at = now()
       where source = v_run.source and removed_at is null
         and last_seen_run_id is distinct from p_run_id;
      get diagnostics v_removed = row_count;
    end if;
  end if;

  update atlas.ingestion_runs
     set status          = v_status,
         finished_at     = now(),
         http_requests   = http_requests   + coalesce((p_counters ->> 'http_requests')::integer, 0),
         records_fetched = records_fetched + coalesce((p_counters ->> 'records_fetched')::integer, 0),
         records_failed  = records_failed  + coalesce((p_counters ->> 'records_failed')::integer, 0),
         records_removed = v_removed,
         error_class     = v_class,
         error_message   = left(v_message, 2000),
         details         = details || coalesce(p_details, '{}'::jsonb)
   where id = p_run_id
  returning * into v_run;

  update atlas.sources
     set last_success_at    = case when v_status in ('succeeded', 'skipped') then now() else last_success_at end,
         http_etag          = case when v_status = 'succeeded'
                                   then coalesce(p_details #>> '{http,etag}', http_etag) else http_etag end,
         http_last_modified = case when v_status = 'succeeded'
                                   then coalesce(p_details #>> '{http,last_modified}', http_last_modified)
                                   else http_last_modified end
   where id = v_run.source;

  if v_src.kind = 'place' and v_status in ('succeeded', 'partial') then
    perform atlas.refresh_linked_places();
    perform atlas.dedupe_places();
  end if;

  return v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- Monitoring view (service_role / atlas_ingest only; used for alerting, see docs/ingestion.md §8)
-- ---------------------------------------------------------------------------

create or replace view atlas.source_health as
select
  s.id                                                    as source,
  s.enabled,
  s.schedule_cron,
  s.last_success_at,
  round(extract(epoch from now() - s.last_success_at) / 3600.0, 1) as hours_since_success,
  lr.status                                               as last_status,
  lr.started_at                                           as last_started_at,
  lr.error_class                                          as last_error_class,
  lr.error_message                                        as last_error_message,
  (select count(*)
     from atlas.ingestion_runs r
    where r.source = s.id
      and r.status in ('failed', 'abandoned', 'partial')
      and r.started_at > coalesce((select max(r2.started_at) from atlas.ingestion_runs r2
                                    where r2.source = s.id and r2.status in ('succeeded', 'skipped')),
                                  '-infinity'::timestamptz)) as consecutive_failures,
  case when s.kind = 'place'
       then (select count(*) from atlas.places p where p.source = s.id and p.removed_at is null)
       else (select count(*) from atlas.events e where e.source = s.id and e.removed_at is null)
  end                                                     as active_records
from atlas.sources s
left join atlas.ingestion_runs lr on lr.id = s.last_run_id;

-- ---------------------------------------------------------------------------
-- Housekeeping (weekly via pg_cron, see migration 0700)
-- ---------------------------------------------------------------------------

create or replace function atlas.purge(
  p_removed_older_than interval default interval '90 days',
  p_runs_older_than    interval default interval '180 days',
  p_events_ended_ago   interval default interval '180 days'
)
returns jsonb
language plpgsql
set search_path = atlas, pg_temp
as $$
declare
  v_places integer;
  v_events integer;
  v_runs   integer;
begin
  delete from atlas.places where removed_at < now() - p_removed_older_than;
  get diagnostics v_places = row_count;

  delete from atlas.events
   where removed_at < now() - p_removed_older_than
      or ends_at < now() - p_events_ended_ago;
  get diagnostics v_events = row_count;

  delete from atlas.ingestion_runs r
   where r.started_at < now() - p_runs_older_than
     and r.status <> 'running'
     and not exists (select 1 from atlas.sources s where s.last_run_id = r.id);
  get diagnostics v_runs = row_count;

  return jsonb_build_object('places', v_places, 'events', v_events, 'runs', v_runs);
end;
$$;
