-- Taiwan Kids Atlas — migration 0100: extensions and roles
-- Runs unchanged on (a) the Supabase CLI local stack, (b) hosted Supabase, and
-- (c) vanilla Postgres 15+ with PostGIS available (e.g. imresamu/postgis:17-3.5 on arm64).
-- See docs/architecture.md §6 and docs/adr/0002-backend-supabase-postgrest.md.

-- Supabase installs extensions into schema "extensions". Create it on vanilla Postgres.
create schema if not exists extensions;

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Supabase ships anon / authenticated / service_role. Create equivalent stand-ins on
-- vanilla Postgres so grants and RLS policies behave the same everywhere.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- Write role for ingestion. NOLOGIN: grant it to a login user per environment
  -- (see docs/architecture.md §8), or run ingestion as postgres/service_role.
  if not exists (select 1 from pg_roles where rolname = 'atlas_ingest') then
    create role atlas_ingest nologin noinherit;
  end if;
end
$$;

grant usage on schema extensions to anon, authenticated, service_role, atlas_ingest;
