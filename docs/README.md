# Taiwan Kids Atlas — engineering docs

Start with [architecture.md](architecture.md).

| Doc | For |
|---|---|
| [architecture.md](architecture.md) | Everyone. Current-state audit, target architecture, data model, environments, config/secrets, work split, risks |
| [data-sources.md](data-sources.md) | Backend, QA. Every external API with live verification evidence, auth, params, licence |
| [api-contract.md](api-contract.md) | Mobile, backend, QA. RPC endpoints, params, TypeScript response types, conventions |
| [ingestion.md](ingestion.md) | Backend, DevOps. Cron, adapters, normalised row contract, retries, removals, monitoring, tests |
| [ci-cd.md](ci-cd.md) | DevOps, QA. What CI gates, how to reproduce it locally, branch/release flow, the approval model |
| [release.md](release.md) | DevOps, owner. **The runbook**: migrations, cron, EAS builds, TestFlight/Play, rollback |
| [release-credentials.md](release-credentials.md) | Owner. Accounts and signing credentials to obtain, as a checklist |
| [secrets.md](secrets.md) | Everyone. Every value that must not be committed, where it lives, how to rotate it |
| [rls-review.md](rls-review.md) | Security, QA. The RLS/privilege model, the executable review, residual risks |
| [observability.md](observability.md) | DevOps, owner. Ingestion alerting and the app crash-reporting recommendation |
| [adr/](adr/README.md) | Decision records |
| [api/examples/](api/examples/) | Real API responses (2026-11-02), also used as mobile mock fixtures |
| [data-sources/examples/](data-sources/examples/) | Trimmed raw feed samples (adapter unit-test inputs) |
| [ingestion/normalized-examples/](ingestion/normalized-examples/) | Expected normaliser output for those samples |
| [ingestion/prototypes/](ingestion/prototypes/README.md) | Reference jq normalisers used to verify the SQL layer |

The database contract itself lives in [`../supabase/migrations/`](../supabase/migrations/).
CI gates (lint, typecheck, tests, migrations, RLS review, secret scan) live in
[`../.github/workflows/`](../.github/workflows/) and
[`../scripts/ci/`](../scripts/ci/).
