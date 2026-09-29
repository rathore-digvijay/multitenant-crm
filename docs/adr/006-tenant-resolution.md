# ADR-006 — Tenant resolution from JWT claim or API key

| Status | Accepted |
|---|---|
| Date | 2026-09-28 |
| Deciders | Digvijay Singh |

## Context
A client-supplied tenant id is an attack vector. Users can belong to several tenants (charter D3).

## Decision
- **Users:** the access token carries `tid` (the active tenant). On each request it is re-checked against an active membership. `POST /auth/switch-tenant` issues a new token for another membership.
- **Integrators:** the API key alone identifies the tenant.
- The context is held in `AsyncLocalStorage`. Tenant ids in the body, query string or headers are ignored.

## Consequences
- ✅ Works for an API-first product without wildcard DNS.
- ✅ A removed member loses access on their next request, even with a valid token.
- ⚠️ One membership lookup per request (cacheable in Redis for 60 s, invalidated on role change).

## Alternatives considered
- **Subdomain (`acme.app.com`):** can be added with the web UI later, as a hint that must match the token.
