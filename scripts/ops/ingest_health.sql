-- Taiwan Kids Atlas — ingestion health check and alert query.
--
-- Reads the durable audit tables (no writes). Prints the per-source health
-- table, then FAILS THE PROCESS (psql exits non-zero) if any enabled source
-- breaches a threshold, so a scheduled job turns the breach into a notification.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ops/ingest_health.sql
--
-- Thresholds come from docs/ingestion.md §8:
--   * no success for more than 36 h          (staled)
--   * 2 or more consecutive failed/partial/abandoned runs (flapping)
--   * last error class 'blocked'             (blocked/ext, e.g. a WAF)
--   * enabled with a schedule but never a successful run (never_succeeded)
--   * active rows below 80 % of the rows the last successful run saw (shrunk)
--
-- The last rule is the day-over-day mass-deletion guard expressed with the
-- history that already exists (ingestion_runs.records_fetched); it needs no
-- extra snapshot table.
--
-- Runnable against local dev too (`docker compose up -d`): sqlite-free, plain SQL.

\set ON_ERROR_STOP on

create temp view _ingest_health as
with last_ok as (
  select distinct on (source) source, records_fetched, started_at
    from atlas.ingestion_runs
   where status = 'succeeded'
     and records_fetched > 0            -- ignore 304-skipped runs
   order by source, started_at desc
)
select
  h.source,
  h.enabled,
  h.schedule_cron,
  h.last_success_at,
  h.hours_since_success,
  h.last_status,
  h.last_error_class,
  h.consecutive_failures,
  h.active_records,
  lo.records_fetched as last_run_seen,
  (h.hours_since_success is not null and h.hours_since_success > 36) as staled,
  (h.consecutive_failures >= 2) as flapping,
  (h.last_error_class = 'blocked') as blocked,
  (h.enabled and h.schedule_cron is not null and h.last_success_at is null) as never_succeeded,
  (lo.records_fetched is not null and h.active_records < 0.8 * lo.records_fetched) as shrunk
from atlas.source_health h
left join last_ok lo on lo.source = h.source;

\echo '── atlas.source_health'
select source, enabled, last_status, hours_since_success, consecutive_failures,
       coalesce(last_error_class, '-') as last_error_class, active_records, last_success_at
  from _ingest_health
 order by source;

\echo '── breaches'
select source, staled, flapping, blocked, never_succeeded, shrunk
  from _ingest_health
 where enabled
   and (staled or flapping or blocked or never_succeeded or shrunk)
 order by source;

do $alert$
declare
  r      record;
  n      int := 0;
  detail text := '';
begin
  for r in
    select * from _ingest_health
     where enabled
       and (staled or flapping or blocked or never_succeeded or shrunk)
     order by source
  loop
    n := n + 1;
    detail := detail || format(
      E'\n  %s: %s',
      r.source,
      concat_ws(', ',
        case when r.staled then
          format('no successful run for %s h (>36)', r.hours_since_success) end,
        case when r.flapping then
          format('%s consecutive failed/partial runs', r.consecutive_failures) end,
        case when r.blocked then
          format('last error class=blocked (%s)', coalesce(r.last_error_class, '?')) end,
        case when r.never_succeeded then
          'enabled with a schedule but never succeeded' end,
        case when r.shrunk then
          format('active records %s < 80%% of the last successful run (%s)',
                 r.active_records, r.last_run_seen) end));
  end loop;

  if n > 0 then
    raise exception 'ingestion health: % enabled source(s) need attention%', n, detail;
  end if;

  raise notice 'ingestion health: every enabled source is healthy';
end
$alert$;
