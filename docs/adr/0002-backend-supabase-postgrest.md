# ADR-0002: Backend — Supabase/PostgREST directly (SQL functions + RLS), no custom API service

- Status: Accepted
- Date: 2026-11-02

## Context

- The data must live in PostgreSQL: local Postgres for development, Supabase for production.
- The app needs read-only, anonymous, filterable, multilingual, geo-aware queries.
- Writes come only from the ingestion job.
- The requirement favours the **simplest option that behaves identically locally and in prod**.

## Options

| Option | Notes |
|---|---|
| **A. Supabase directly**: PostgREST exposes SQL functions (RPC); RLS; Edge Functions + pg_cron for ingestion | Zero servers to run. The contract is defined in SQL migrations, so it is identical wherever the migrations run. PostgREST is the same software locally (Supabase CLI or a plain PostgREST container) and in prod. |
| B. Thin API service (Node/Fastify or Deno/Hono) on Postgres | Full control over response shapes and caching, but adds a service to host, scale, secure and deploy, plus a second place for business logic. Supabase still holds the DB, so the platform is not simpler. |
| C. pg_graphql (Supabase GraphQL) | No gain for a handful of fixed queries. Weaker for geo and i18n logic, and the client needs more tooling. |
| D. Auto-generated table REST (`/rest/v1/places?…`) | Leaks the storage schema into the client. i18n fallback and distance sorting cannot be done cleanly. Every schema change breaks the app. |

## Decision

**Option A.**

- Data lives in schema `atlas`. Supabase does not expose it through PostgREST, so tables are not reachable
  over HTTP.
- The public contract is eight `STABLE`, `SECURITY INVOKER` SQL functions in `public`: `places_search`,
  `place_detail`, `places_map`, `events_search`, `event_detail`, `categories_list`, `areas_list`, `app_meta`.
  They take named params, resolve i18n server-side, do PostGIS distance and bbox queries, and paginate
  with `page_size` / `page_offset` / `total_count`.
- RLS is on for every table. `anon` and `authenticated` get SELECT on readable tables with policies that
  hide removed rows, plus EXECUTE on the eight functions only. Writes go through `atlas_ingest`,
  `service_role` or `postgres` only. `EXECUTE` is revoked from `PUBLIC` on every `atlas.*` function.
- PostGIS (`geography(point,4326)` + GiST) handles near-me, radius and bbox. pg_trgm handles name search.

## Local / prod parity

- **Default dev stack: Supabase CLI** (`supabase start`). It runs the same Postgres image as hosted Supabase,
  with PostgREST, Kong, the Edge runtime, pg_cron, pg_net and Vault. URLs differ only by host:
  `http://127.0.0.1:54321/rest/v1` locally, `https://<ref>.supabase.co/rest/v1` in prod.
- **Vanilla path (CI, lightweight dev):** Postgres + PostGIS (`imresamu/postgis:17-3.5`, which is
  multi-arch; the official `postgis/postgis` image has **no arm64 build**, and the owner's Mac is arm64) plus
  `postgrest/postgrest:v12.2.3`. The same migrations apply unchanged: migration 0100 creates `anon`,
  `authenticated`, `service_role` and `atlas_ingest` when they are missing, and 0700 skips pg_cron and
  pg_net when they are unavailable. The API paths have no `/rest/v1` prefix.
- Verified 2026-11-02: all migrations apply on vanilla PostGIS (with PostGIS in `extensions` and in
  `public`) and on `supabase/postgres:17.11.0.015` as non-superuser `postgres`. PostgREST serves the RPCs
  with GET array params, and does not expose tables or ingestion functions. See ingestion.md §10.

## Consequences

- Business logic for reads (filters, fallback, ranking) lives in SQL and is versioned with the migrations.
  Tests are SQL/integration tests.
- Breaking API changes need a new function name (api-contract.md §8).
- There is no server-side response cache. The dataset is small (about 6k places) and every query is
  index-backed. Supabase's CDN or edge cache can be added later. The client caches with TanStack Query.
- Rate limiting and abuse protection come from Supabase platform defaults. There are no write endpoints to abuse.
- If a future feature needs auth (favourites sync, user submissions), add Supabase Auth, user tables in a
  new schema, and RLS by `auth.uid()`. This ADR does not block that.
