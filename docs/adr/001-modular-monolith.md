# ADR-001 — Modular monolith, two processes

| Status | Accepted |
|---|---|
| Date | 2026-09-28 |
| Deciders | Digvijay Singh |

## Context
One engineer, a v1 target of 100 tenants and about 50 requests per second, and a learning goal centred on tenant isolation rather than service mesh concerns.

## Decision
Build one NestJS codebase in a pnpm monorepo, split into modules with owned tables. Deploy it as two processes: `api` and `worker`.

## Consequences
- ✅ One deploy and one database transaction boundary, so the outbox and idempotency stay simple.
- ✅ Modules can be extracted into services later along their existing boundaries.
- ⚠️ Module boundaries must be protected: import-boundary lint and no cross-module table access.

## Alternatives considered
- **Microservices:** operational overhead with no benefit at this scale.
- **Single process with jobs running in the API:** slow jobs would compete with request latency.
