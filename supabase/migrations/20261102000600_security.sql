-- Taiwan Kids Atlas — migration 0600: privileges and row level security
-- Model (docs/architecture.md §7):
--   * anon / authenticated: read-only, only through public.* API functions (SECURITY INVOKER).
--     They get SELECT on the readable atlas tables, filtered by RLS. Schema atlas is not exposed by
--     PostgREST, so tables are not reachable directly over HTTP.
--   * atlas_ingest (and service_role / postgres): write access + ingestion functions.
--   * Nobody else may execute atlas.* functions (Postgres grants EXECUTE to PUBLIC by default).

grant usage on schema atlas to anon, authenticated, service_role, atlas_ingest;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema atlas from public;

-- i18n/helpers used inside the public API functions
grant execute on function atlas.pick_lang(jsonb, text), atlas.t(jsonb, text), atlas.norm_zh(text)
  to anon, authenticated, service_role, atlas_ingest;

-- ingestion surface
grant execute on all functions in schema atlas to service_role, atlas_ingest;

-- public API
revoke execute on function
  public.places_search(text, text, text[], text, text, boolean, double precision, double precision, integer, text, integer, integer),
  public.place_detail(uuid, text),
  public.places_map(double precision, double precision, double precision, double precision, text, text[], boolean, integer),
  public.events_search(text, text, text[], text, text, boolean, date, date, double precision, double precision, integer, text, integer, integer),
  public.event_detail(uuid, text),
  public.categories_list(text, text),
  public.areas_list(text, text),
  public.app_meta(text)
from public;

grant execute on function
  public.places_search(text, text, text[], text, text, boolean, double precision, double precision, integer, text, integer, integer),
  public.place_detail(uuid, text),
  public.places_map(double precision, double precision, double precision, double precision, text, text[], boolean, integer),
  public.events_search(text, text, text[], text, text, boolean, date, date, double precision, double precision, integer, text, integer, integer),
  public.event_detail(uuid, text),
  public.categories_list(text, text),
  public.areas_list(text, text),
  public.app_meta(text)
to anon, authenticated, service_role, atlas_ingest;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

grant select on atlas.places, atlas.events, atlas.event_occurrences, atlas.categories, atlas.admin_areas
  to anon, authenticated;
-- sources: hide operational columns (config, etag, last_run_id ...) from public readers
grant select (id, kind, name, publisher, homepage_url, dataset_url, license, license_url,
              attribution, enabled, last_success_at)
  on atlas.sources to anon, authenticated;

grant select, insert, update, delete on all tables in schema atlas to service_role, atlas_ingest;
grant usage, select on all sequences in schema atlas to service_role, atlas_ingest;

alter table atlas.sources           enable row level security;
alter table atlas.admin_areas       enable row level security;
alter table atlas.categories        enable row level security;
alter table atlas.category_mappings enable row level security;
alter table atlas.places            enable row level security;
alter table atlas.events            enable row level security;
alter table atlas.event_occurrences enable row level security;
alter table atlas.ingestion_runs    enable row level security;
alter table atlas.ingestion_errors  enable row level security;

-- Public read policies
create policy sources_read on atlas.sources
  for select to anon, authenticated using (true);
create policy admin_areas_read on atlas.admin_areas
  for select to anon, authenticated using (true);
create policy categories_read on atlas.categories
  for select to anon, authenticated using (true);
create policy places_read on atlas.places
  for select to anon, authenticated using (removed_at is null);
create policy events_read on atlas.events
  for select to anon, authenticated using (removed_at is null);
create policy event_occurrences_read on atlas.event_occurrences
  for select to anon, authenticated
  using (exists (select 1 from atlas.events e where e.id = event_id and e.removed_at is null));
-- category_mappings, ingestion_runs, ingestion_errors: no anon/authenticated policy => no rows.

-- Ingestion writer policies (service_role and postgres bypass RLS already)
create policy sources_ingest on atlas.sources for all to atlas_ingest using (true) with check (true);
create policy admin_areas_ingest on atlas.admin_areas for all to atlas_ingest using (true) with check (true);
create policy categories_ingest on atlas.categories for all to atlas_ingest using (true) with check (true);
create policy category_mappings_ingest on atlas.category_mappings for all to atlas_ingest using (true) with check (true);
create policy places_ingest on atlas.places for all to atlas_ingest using (true) with check (true);
create policy events_ingest on atlas.events for all to atlas_ingest using (true) with check (true);
create policy event_occurrences_ingest on atlas.event_occurrences for all to atlas_ingest using (true) with check (true);
create policy ingestion_runs_ingest on atlas.ingestion_runs for all to atlas_ingest using (true) with check (true);
create policy ingestion_errors_ingest on atlas.ingestion_errors for all to atlas_ingest using (true) with check (true);

-- Ask PostgREST to reload its schema cache (no-op where PostgREST is not listening).
notify pgrst, 'reload schema';
