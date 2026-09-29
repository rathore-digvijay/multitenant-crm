# ADR-007 — Build our own authentication

| Status | Accepted |
|---|---|
| Date | 2026-09-28 |
| Deciders | Digvijay Singh |

## Context
This is a learning project; auth and tenancy are tightly coupled (the active tenant lives in the token).

## Decision
Implement email/password auth ourselves: argon2id hashes, a 15-minute JWT access token, and a 7-day rotating refresh token in an httpOnly cookie with reuse detection (revoke the whole token family).

## Consequences
- ✅ Full control over the tenant claim and switch-tenant flow; valuable learning.
- ⚠️ We own the security risk, so it is covered by NFR-SEC tests and a threat-model review (stage 7).

## Alternatives considered
- **Auth0 / Cognito:** less risk, but it hides exactly what this project is meant to teach. It can be swapped in later behind the `auth` module.
