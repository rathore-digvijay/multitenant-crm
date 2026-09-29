# ADR-002 — Shared database, shared schema, RLS enforcement

| Status | Accepted |
|---|---|
| Date | 2026-09-28 |
| Deciders | Digvijay Singh |

## Context
Tenants must never see each other's data. Options: a database per tenant, a schema per tenant, or a shared schema with `tenant_id`.

## Decision
Use one database and one schema. Every tenant-owned table has `tenant_id uuid NOT NULL`, and isolation is enforced by three layers:
1. The tenant is resolved once, in middleware (JWT claim or API key).
2. A scoped data layer (`db.forTenant(ctx)`) sets `app.tenant_id` per transaction and adds `tenant_id` to every query.
3. A Postgres RLS policy is **enabled and forced** on every tenant table; the runtime role has no `BYPASSRLS`.

## Consequences
- ✅ Cheapest to run and migrate (one migration run), and it scales to thousands of tenants.
- ✅ A bug in layer 2 is still stopped by layer 3.
- ⚠️ One tenant can still slow others down, so rate limits and job fairness are needed (NFR-FAIR).
- ⚠️ Lookups before a tenant exists need narrow `SECURITY DEFINER` functions (HLD §7).
- ⚠️ Every index must start with `tenant_id`.

## Alternatives considered
- **Database per tenant:** strongest isolation, but N migrations, N connection pools, and costly on RDS.
- **Schema per tenant:** migrations grow with tenant count, and `search_path` bugs cause leaks too.
