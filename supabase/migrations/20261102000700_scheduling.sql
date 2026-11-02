-- Taiwan Kids Atlas — migration 0700: scheduling (pg_cron + pg_net -> Edge Function "ingest")
-- Works on Supabase (hosted and CLI local stack). On vanilla Postgres without pg_cron/pg_net the
-- extensions are skipped; the functions are still created but only run where the extensions exist.
-- Dev without pg_cron: run the CLI worker on demand or via docker cron (docs/ingestion.md §7).
--
-- NOTHING IS SCHEDULED BY THIS MIGRATION. Enabling the cron is an explicit operator step:
--   1. store secrets in Vault (names below);
--   2. select atlas.sync_cron_schedules();
-- To change a schedule: update atlas.sources set schedule_cron = '...' where id = '...';
--                       select atlas.sync_cron_schedules();

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  else
    raise notice 'pg_cron not available: scheduling functions created but inert';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  else
    raise notice 'pg_net not available: atlas.invoke_ingest() will fail until it is installed';
  end if;
end
$$;

-- POSTs {"source": ..., "trigger": "cron"} to the ingest Edge Function.
-- Vault secrets (create once per environment, never commit values):
--   ingest_function_url  e.g. https://<project-ref>.supabase.co/functions/v1/ingest
--                        local: http://host.docker.internal:54321/functions/v1/ingest
--   ingest_cron_secret   random 32+ byte string; same value as the function's INGEST_CRON_SECRET
create or replace function atlas.invoke_ingest(p_source text)
returns bigint
language plpgsql
security definer
set search_path = atlas, pg_temp
as $$
declare
  v_url    text;
  v_secret text;
  v_req    bigint;
begin
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'ingest_function_url'$q$
     into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret'$q$
     into v_secret;
  if v_url is null or v_secret is null then
    raise exception 'Vault secrets ingest_function_url and ingest_cron_secret must be set';
  end if;

  execute $q$select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)$q$
     into v_req
    using v_url,
          jsonb_build_object('source', p_source, 'trigger', 'cron'),
          jsonb_build_object('Content-Type', 'application/json',
                             'Authorization', 'Bearer ' || v_secret);
  return v_req;
end;
$$;

-- (Re)creates one cron job per enabled source with a schedule, plus the weekly purge job.
-- Returns the job names that are scheduled after the call.
create or replace function atlas.sync_cron_schedules()
returns setof text
language plpgsql
security definer
set search_path = atlas, pg_temp
as $$
declare
  s record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is not installed in this database';
  end if;

  for s in select id, enabled, schedule_cron from atlas.sources order by id loop
    execute 'select cron.unschedule(jobid) from cron.job where jobname = $1'
      using 'atlas_ingest_' || s.id;
    if s.enabled and s.schedule_cron is not null then
      execute 'select cron.schedule($1, $2, $3)'
        using 'atlas_ingest_' || s.id, s.schedule_cron, format('select atlas.invoke_ingest(%L)', s.id);
      return next 'atlas_ingest_' || s.id;
    end if;
  end loop;

  execute 'select cron.schedule($1, $2, $3)'
    using 'atlas_purge', '30 19 * * 0', 'select atlas.purge()';   -- Mondays 03:30 Asia/Taipei
  return next 'atlas_purge';
end;
$$;

-- Removes every atlas cron job (rollback / pause switch).
create or replace function atlas.unschedule_all()
returns integer
language plpgsql
security definer
set search_path = atlas, pg_temp
as $$
declare
  v_n integer := 0;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select count(cron.unschedule(jobid))::int from cron.job where jobname like 'atlas\_%'$q$
       into v_n;
  end if;
  return v_n;
end;
$$;

revoke execute on function atlas.invoke_ingest(text), atlas.sync_cron_schedules(), atlas.unschedule_all()
  from public, anon, authenticated, atlas_ingest;
grant execute on function atlas.invoke_ingest(text), atlas.sync_cron_schedules(), atlas.unschedule_all()
  to service_role;
