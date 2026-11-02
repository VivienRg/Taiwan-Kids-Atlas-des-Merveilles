-- Taiwan Kids Atlas — RLS and privilege review.
--
-- Runs against a database with supabase/migrations applied:
--   psql -v ON_ERROR_STOP=1 -f scripts/ci/rls_check.sql
-- (CI: .github/workflows/ci.yml, job "backend", as the superuser postgres.)
--
-- This is the machine-checkable half of the RLS review in docs/rls-review.md.
-- It fails loudly (non-zero exit) the moment the public boundary regresses:
-- anything anon/authenticated can reach without going through the 8 public API
-- functions, or any atlas.* writer function left executable by the public.
--
-- Every check is read-only: no grant or policy is modified.
--
-- Note: privilege checks use the oid overloads
-- (has_function_privilege(role_oid, func_oid, 'execute')); the name-based
-- 3-argument form has a special grammar production that rejects expressions.

\set ON_ERROR_STOP on

do $review$
declare
  api      text[] := array['places_search','place_detail','places_map','events_search',
                            'event_detail','categories_list','areas_list','app_meta'];
  helpers  text[] := array['t','pick_lang','norm_zh'];
  writers  text[] := array['start_run','upsert_places','upsert_events','finish_run',
                           'log_ingestion_error','invoke_ingest','sync_cron_schedules',
                           'unschedule_all','purge'];
  hidden   text[] := array['category_mappings','ingestion_runs','ingestion_errors'];
  readable text[] := array['places','events','event_occurrences','sources',
                           'categories','admin_areas'];
  priv_cols text[] := array['config','http_etag','http_last_modified','last_run_id',
                            'min_keep_ratio','schedule_cron','updated_at'];
  pub_cols  text[] := array['id','kind','name','publisher','license','license_url',
                            'attribution','enabled','last_success_at'];
  anon_oid  oid := 'anon'::regrole::oid;
  auth_oid  oid := 'authenticated'::regrole::oid;
  svc_oid   oid := 'service_role'::regrole::oid;
  ing_oid   oid := 'atlas_ingest'::regrole::oid;
  f    text;
  bad  text;
begin
  -- 1) RLS is enabled on every atlas table -----------------------------------
  select string_agg(c.relname, ', ' order by c.relname) into bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'atlas' and c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then
    raise exception 'RLS is disabled on atlas table(s): %', bad;
  end if;

  -- 2) every public-readable table has an anon SELECT policy -----------------
  foreach f in array readable loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'atlas' and tablename = f
         and cmd in ('SELECT', 'ALL') and ('anon'::name = any (roles))
    ) then
      raise exception 'atlas.% has no anon SELECT policy', f;
    end if;
  end loop;

  -- 3) operational tables (and the health view) are not readable ------------
  foreach f in array hidden loop
    if has_table_privilege(anon_oid, ('atlas.' || f)::regclass::oid, 'select') then
      raise exception 'SECURITY: anon can SELECT atlas.%', f;
    end if;
    if has_table_privilege(auth_oid, ('atlas.' || f)::regclass::oid, 'select') then
      raise exception 'SECURITY: authenticated can SELECT atlas.%', f;
    end if;
  end loop;
  if has_table_privilege(anon_oid, 'atlas.source_health'::regclass::oid, 'select') then
    raise exception 'SECURITY: anon can SELECT atlas.source_health';
  end if;

  -- 4) atlas.sources exposes attribution, not operational columns -----------
  if has_table_privilege(anon_oid, 'atlas.sources'::regclass::oid, 'select') then
    raise exception 'SECURITY: anon has TABLE-level SELECT on atlas.sources (bypasses column grants)';
  end if;
  foreach f in array priv_cols loop
    if has_column_privilege(anon_oid, 'atlas.sources'::regclass::oid, f, 'select') then
      raise exception 'SECURITY: anon can read atlas.sources.%', f;
    end if;
  end loop;
  foreach f in array pub_cols loop
    if not has_column_privilege(anon_oid, 'atlas.sources'::regclass::oid, f, 'select') then
      raise exception 'anon cannot read atlas.sources.% (required for licence attribution)', f;
    end if;
  end loop;

  -- 5) the function surface -------------------------------------------------
  foreach f in array api loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = f
         and has_function_privilege(anon_oid, p.oid, 'execute')
    ) then
      raise exception 'anon cannot EXECUTE public.%()', f;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = f and p.prosecdef
    ) then
      raise exception 'public.%() is SECURITY DEFINER (the API must run as the caller)', f;
    end if;
  end loop;

  foreach f in array helpers loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'atlas' and p.proname = f
         and has_function_privilege(anon_oid, p.oid, 'execute')
    ) then
      raise exception 'anon cannot EXECUTE atlas.%() (needed inside the API functions)', f;
    end if;
  end loop;

  foreach f in array writers loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'atlas' and p.proname = f
         and (has_function_privilege(anon_oid, p.oid, 'execute')
           or has_function_privilege(auth_oid, p.oid, 'execute'))
    ) then
      raise exception 'SECURITY: anon/authenticated can EXECUTE atlas.%()', f;
    end if;
  end loop;

  foreach f in array array['invoke_ingest','sync_cron_schedules','unschedule_all'] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'atlas' and p.proname = f
         and has_function_privilege(svc_oid, p.oid, 'execute')
    ) then
      raise exception 'service_role cannot EXECUTE atlas.%()', f;
    end if;
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'atlas' and p.proname = f and p.prosecdef
    ) then
      raise exception 'atlas.%() must be SECURITY DEFINER (it reads Vault)', f;
    end if;
  end loop;

  foreach f in array array['start_run','upsert_places','upsert_events','finish_run',
                           'log_ingestion_error','purge'] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'atlas' and p.proname = f
         and has_function_privilege(ing_oid, p.oid, 'execute')
    ) then
      raise exception 'atlas_ingest cannot EXECUTE atlas.%()', f;
    end if;
  end loop;

  -- 6) the public schema holds no application tables (PostgREST exposes it).
  -- spatial_ref_sys is PostGIS's static SRID catalogue, created in public by
  -- the extension itself on every Supabase project; it holds no app data.
  select string_agg(c.relname, ', ' order by c.relname) into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and c.relname <> 'spatial_ref_sys';
  if bad is not null then
    raise exception 'table(s) exposed in the public schema: %', bad;
  end if;

  raise notice 'ok  catalog review: RLS, policies, table/column/function grants';
end
$review$;

-- 7) behavioural probes: run real statements as anon ------------------------
-- Each probe asserts the expected outcome, so a privilege change that silently
-- widens access becomes a CI failure instead of a surprise in production.
do $probe$
declare
  n bigint;
begin
  set local role anon;

  begin
    perform count(*) from atlas.ingestion_runs;
    raise exception 'SECURITY: anon read atlas.ingestion_runs';
  exception when insufficient_privilege then
    raise notice 'ok  anon is denied atlas.ingestion_runs';
  end;

  begin
    perform config from atlas.sources limit 1;
    raise exception 'SECURITY: anon read atlas.sources.config';
  exception when insufficient_privilege then
    raise notice 'ok  anon is denied atlas.sources.config';
  end;

  begin
    perform atlas.start_run('curated', 'test', 'rls-check');
    raise exception 'SECURITY: anon called atlas.start_run()';
  exception when insufficient_privilege then
    raise notice 'ok  anon is denied atlas.start_run()';
  end;

  begin
    perform atlas.invoke_ingest('moc_kids_events');
    raise exception 'SECURITY: anon called atlas.invoke_ingest()';
  exception when insufficient_privilege then
    raise notice 'ok  anon is denied atlas.invoke_ingest()';
  end;

  -- the read path must still work, and RLS must hide soft-deleted rows
  select count(*) into n from atlas.places;
  raise notice 'ok  anon reads atlas.places through RLS (% visible rows)', n;
  select count(*) into n from atlas.places where removed_at is not null;
  if n <> 0 then
    raise exception 'RLS leak: anon sees % soft-deleted place(s)', n;
  end if;
  raise notice 'ok  RLS hides soft-deleted rows from anon';

  perform count(*) from atlas.event_occurrences;
  raise notice 'ok  anon reads atlas.event_occurrences through RLS';

  perform * from public.app_meta('en');
  raise notice 'ok  anon can call the public API functions';
end
$probe$;

\echo 'rls_check.sql: all checks passed'
