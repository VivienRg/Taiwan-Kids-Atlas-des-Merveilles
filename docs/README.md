# Taiwan Kids Atlas — engineering docs

Start with [architecture.md](architecture.md).

| Doc | For |
|---|---|
| [architecture.md](architecture.md) | Everyone. Current-state audit, target architecture, data model, environments, config/secrets, work split, risks |
| [data-sources.md](data-sources.md) | Backend, QA. Every external API with live verification evidence, auth, params, licence |
| [api-contract.md](api-contract.md) | Mobile, backend, QA. RPC endpoints, params, TypeScript response types, conventions |
| [ingestion.md](ingestion.md) | Backend, DevOps. Cron, adapters, normalised row contract, retries, removals, monitoring, tests |
| [adr/](adr/README.md) | Decision records |
| [api/examples/](api/examples/) | Real API responses (2026-11-02), also used as mobile mock fixtures |
| [data-sources/examples/](data-sources/examples/) | Trimmed raw feed samples (adapter unit-test inputs) |
| [ingestion/normalized-examples/](ingestion/normalized-examples/) | Expected normaliser output for those samples |
| [ingestion/prototypes/](ingestion/prototypes/README.md) | Reference jq normalisers used to verify the SQL layer |

The database contract itself lives in [`../supabase/migrations/`](../supabase/migrations/).
