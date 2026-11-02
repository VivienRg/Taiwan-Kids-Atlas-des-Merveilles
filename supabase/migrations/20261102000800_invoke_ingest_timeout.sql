-- Taiwan Kids Atlas — migration 0800: pg_net client timeout for the ingest trigger.
--
-- WHY (verified 2026-11-03 on the Supabase CLI stack, supabase/postgres 17.11):
-- migration 0700 called net.http_post(..., timeout_milliseconds := 10000). The
-- ingest Edge Function now answers 202 as soon as the run row exists and does the
-- work in EdgeRuntime.waitUntil, so a normal response is sub-second. The client
-- timeout is raised anyway, because a client timeout is not a no-op: measured on
-- the local stack, when pg_net gave up at 10 s the edge runtime logged
-- `WorkerRequestCancelled`, the run stayed `running` until the 2 h sweeper and
-- nothing was ingested. A slow cold start or a DB-lock wait must never turn into
-- a silently cancelled ingestion:
--
--   select id, status_code, error_msg from net._http_response;
--    id | status_code |                                      error
--   2  |             | Timeout of 10000 ms reached. Total time: 10007.005000 ms (DNS time: 1.707000 ms, ...
--
-- 180000 sits above the function's own deadline (INGEST_DEADLINE_MS = 120000,
-- docs/architecture.md §8.2) so the client always outlives the work it started.
-- 300000 would exceed the Supabase gateway's own ~60 s request timeout, which is
-- the real ceiling for a *synchronous* response; the background pattern in
-- supabase/functions/ingest/index.ts is what keeps runs short.
--
-- This does NOT change the schedule or any other behaviour; everything else in
-- atlas.invoke_ingest is the definition from 0700.

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

  execute $q$select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 180000)$q$
     into v_req
    using v_url,
          jsonb_build_object('source', p_source, 'trigger', 'cron'),
          jsonb_build_object('Content-Type', 'application/json',
                             'Authorization', 'Bearer ' || v_secret);
  return v_req;
end;
$$;

-- CREATE OR REPLACE keeps the existing ACL, but re-assert the boundary so this
-- file is self-contained (docs/rls-review.md, scripts/ci/rls_check.sql).
revoke execute on function atlas.invoke_ingest(text) from public, anon, authenticated, atlas_ingest;
grant execute on function atlas.invoke_ingest(text) to service_role;
