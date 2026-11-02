# Architecture decision records

| ADR | Title | Status |
|---|---|---|
| [0001](0001-mobile-stack-expo.md) | Mobile stack: Expo (React Native, TS), Expo Router, EAS Build | Accepted |
| [0002](0002-backend-supabase-postgrest.md) | Backend: Supabase/PostgREST directly (SQL functions + RLS), no custom API service | Accepted |
| [0003](0003-data-sources.md) | Data sources: national Tourism Administration feeds primary; Taipei Travel API defined but disabled | Accepted (revisit) |
| [0004](0004-ingestion-runtime.md) | Ingestion runtime: Deno TS core; Edge Function + pg_cron in prod, CLI in dev | Accepted |

Each ADR follows the format Context → Decision → Alternatives → Consequences. To supersede one, add a new
ADR and set the old one's status to "Superseded by NNNN".
