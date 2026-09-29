# 02 — Non-Functional Requirements (NFR)

| Field | Value |
|---|---|
| Project | multitenant-crm |
| Author / Owner | Digvijay Singh |
| Status | Approved v1.0 |
| Last updated | 2026-09-28 |
| Depends on | [00-charter.md](./00-charter.md), [01-prd.md](./01-prd.md) |

Every requirement has an ID, a measurable target, and a **verification** method. A requirement with no way to verify it is not a requirement.

---

## 1. Tenant isolation (highest priority)

| ID | Requirement | Target | Verification |
|---|---|---|---|
| NFR-ISO1 | **Layer 1:** the tenant is resolved once per request (from a JWT claim or an API key) and stored in the request context. A tenant id in the body, query string or headers is ignored. | 100% of routes | Lint rule + test: a request with a forged `tenant_id` in the body still acts on the caller's own tenant |
| NFR-ISO2 | **Layer 2:** handlers reach data only through `db.forTenant(ctx)`. There is no raw database client in app code. | 0 raw imports | ESLint `no-restricted-imports` on the DB driver outside `/data` |
| NFR-ISO3 | **Layer 3:** Postgres RLS is enabled **and forced** on every tenant-owned table. The app connects as a non-owner role without `BYPASSRLS`. | 100% of tenant tables | A migration test lists tables that have `tenant_id` but no enabled + forced policy. That list must be empty. |
| NFR-ISO4 | The tenant setting is applied with `set_config(..., true)`, which lasts only for the current transaction, so no tenant context leaks between pooled connections. | — | Test: two concurrent requests from different tenants on a pool of 1 connection |
| NFR-ISO5 | A missing tenant setting returns **zero rows**; it never errors open. | — | Test: a query without the setting returns empty |
| NFR-ISO6 | A resource outside the caller's scope returns **404**, never 403. | 100% of `:id` routes | Cross-tenant suite (below) |
| NFR-ISO7 | **Cross-tenant suite:** for every endpoint, call with tenant A's credentials and tenant B's ids. Also call with Layer 2 disabled, to prove RLS alone still blocks. | 0 leaks. **A failure blocks release.** | CI job `test:isolation` |
| NFR-ISO8 | Everything outside Postgres is tenant-scoped too: Redis keys are prefixed `t:{tenantId}:`, file storage paths are prefixed `tenants/{tenantId}/`, and every job payload carries `tenantId`, which the worker sets as its context again. | 100% | Code review checklist + an integration test for each queue |

## 2. Security

| ID | Requirement | Target | Verification |
|---|---|---|---|
| NFR-SEC1 | Passwords are hashed with **argon2id** (memory ≥ 19 MiB, time cost ≥ 2). | — | Unit test on parameters |
| NFR-SEC2 | Access token (JWT) lives **15 min**. Refresh token lives **7 days**, is rotated on every use, and is stored in an httpOnly, Secure, SameSite=Strict cookie. Reusing an old refresh token revokes the whole token family. | — | Integration tests |
| NFR-SEC3 | API keys have the format `mtc_live_<32 random bytes, base62>`. Only the SHA-256 hash and the first 8 characters (for display) are stored. The full key is shown once. | — | Unit + DB inspection test |
| NFR-SEC4 | Invite tokens are 32 random bytes; only the hash is stored. They are single-use and expire in 7 days. | — | Integration test |
| NFR-SEC5 | Razorpay webhooks are verified by HMAC signature before any processing. Unsigned or invalid requests return `400` and are logged. | 100% | Test with a tampered payload |
| NFR-SEC6 | Input is validated at the edge with a schema (zod). Unknown fields are stripped. | All routes | Contract tests |
| NFR-SEC7 | Security headers (helmet), CORS allow-list, and a 1 MB body limit (10 MB on the upload route). | — | Test |
| NFR-SEC8 | Login is rate-limited to 5 failures per 15 min per account and per IP. | — | Test |
| NFR-SEC9 | Secrets live only in environment variables or secrets manager, never in the repo. | 0 findings | gitleaks in CI |
| NFR-SEC10 | Dependencies are scanned. | 0 high or critical vulnerabilities at release | `npm audit` / Snyk in CI |

## 3. Performance

Measured under the scale target in section 4, with warm caches.

| ID | Requirement | Target | Verification |
|---|---|---|---|
| NFR-PERF1 | Read endpoints (lists, get by id) | Median < 100 ms, 95th percentile < 300 ms | k6 load test |
| NFR-PERF2 | Write endpoints | 95th percentile < 500 ms | k6 |
| NFR-PERF3 | Lead ingestion API | 95th percentile < 200 ms, at 20 requests per second sustained | k6 |
| NFR-PERF4 | Sheet upload of 5,000 rows | Processing done in < 60 s | Integration benchmark |
| NFR-PERF5 | Every tenant-scoped query uses an index that starts with `tenant_id`. | No sequential scans on tables over 10k rows | `EXPLAIN` checks in tests for the top queries |
| NFR-PERF6 | Lists use cursor pagination only, max 100 items per page. | — | Contract test |

## 4. Scalability (v1 target)

| Dimension | Target |
|---|---|
| Tenants | 100 |
| Users per tenant | 50 |
| Leads (total) | 1,000,000 |
| Policies (total) | 200,000 |
| Peak throughput | 50 requests per second overall |

- The API is **stateless**, so it can scale horizontally behind a load balancer.
- Background jobs (uploads, reminders, emails) run in a **separate worker process** fed by a queue, so a slow job never blocks an API request.

## 5. Availability and recovery

| ID | Requirement | Local | AWS (post-v1) |
|---|---|---|---|
| NFR-AV1 | Uptime | n/a | 99.5% monthly |
| NFR-AV2 | Backups | n/a | Daily automated, 7-day point-in-time recovery |
| NFR-AV3 | Maximum data loss (RPO) | n/a | ≤ 5 min |
| NFR-AV4 | Maximum time to restore (RTO) | n/a | ≤ 1 hour |
| NFR-AV5 | Graceful shutdown drains in-flight requests and jobs within 30 s. | ✅ | ✅ |
| NFR-AV6 | Health endpoints: `/healthz` (liveness) and `/readyz` (database and Redis checks) | ✅ | ✅ |

## 6. Fairness between tenants

| ID | Requirement | Target |
|---|---|---|
| NFR-FAIR1 | Rate limit per tenant (all users combined) | 300 requests a minute (configurable per plan) |
| NFR-FAIR2 | Rate limit per API key | 60 requests a minute |
| NFR-FAIR3 | Background jobs: one upload running per tenant at a time; the rest queue up. | — |
| NFR-FAIR4 | Rate limiting is Redis-backed (sliding window) and returns `429` with a `Retry-After` header. | — |

## 7. Privacy and compliance (DPDP Act, India)

| ID | Requirement | Verification |
|---|---|---|
| NFR-PRV1 | Lead name, phone and email count as personal data. They are **masked in logs** (e.g. `+91******3210`). | Log redaction unit test |
| NFR-PRV2 | Encryption at rest (RDS/EBS) and TLS 1.2+ in transit (on AWS). | Infra config review |
| NFR-PRV3 | The owner can trigger **tenant data deletion**: a soft delete immediately, a hard purge after 30 days. | Integration test |
| NFR-PRV4 | Personal data is never sent to third parties other than the email provider. | Architecture review |
| NFR-PRV5 | Data residency: AWS `ap-south-1` (Mumbai). | Infra config |

## 8. Auditability

| ID | Requirement |
|---|---|
| NFR-AUD1 | Activity history for leads and policies (PRD FR-H1): append-only. |
| NFR-AUD2 | A security audit log for login success and failure, invite create/accept/revoke, role change, ownership transfer, API key create and revoke, and plan change. It records actor, tenant, IP, user agent and time. |
| NFR-AUD3 | Both are append-only at the database level: the app role has `INSERT` and `SELECT` only. |
| NFR-AUD4 | Retention: at least 1 year. |

## 9. Observability

| ID | Requirement |
|---|---|
| NFR-OBS1 | Structured JSON logs (pino). Every line has `request_id`, `tenant_id`, `user_id`, `route`, `status` and `latency_ms`. |
| NFR-OBS2 | OpenTelemetry traces across API → queue → worker, carrying the trace context through the job payload. |
| NFR-OBS3 | Metrics: request rate, errors, duration (RED) per route and tenant; queue depth and job duration; DB pool usage. |
| NFR-OBS4 | Locally: Grafana + Prometheus + Tempo/Jaeger through docker compose (optional profile). |
| NFR-OBS5 | Error responses follow one shape (RFC 7807 problem+json) with a `request_id` for support. |

## 10. Idempotency and reliability

| ID | Requirement | Mechanism |
|---|---|---|
| NFR-IDM1 | Razorpay webhooks | Insert `provider_event_id` (unique) in the same transaction as the effect. On conflict, return `200` and do nothing. |
| NFR-IDM2 | Lead ingestion | `Idempotency-Key` header stored per tenant for 24 hours with the response; a replay returns the stored response. |
| NFR-IDM3 | Renewal reminders | Unique on `(policy_id, threshold_days)` in `reminders_sent` |
| NFR-IDM4 | Invite accept | A single conditional `UPDATE ... WHERE accepted_at IS NULL AND expires_at > now()` |
| NFR-IDM5 | Jobs retry with exponential backoff (max 5). After that they move to a dead-letter queue and are visible to ops. | Queue configuration |
| NFR-IDM6 | Side effects (emails, notifications) are written to an **outbox table** in the same transaction as the data change, then dispatched by the worker. | Transactional outbox |

## 11. Maintainability

| ID | Requirement | Target |
|---|---|---|
| NFR-MNT1 | TypeScript `strict: true`; ESLint + Prettier enforced in CI | 0 errors |
| NFR-MNT2 | Test coverage | ≥ 80% overall; ≥ 95% on the permission, tenant-scoping and billing modules |
| NFR-MNT3 | Database changes only through versioned migrations | — |
| NFR-MNT4 | An ADR for every significant decision | — |
| NFR-MNT5 | The OpenAPI spec is the contract; CI fails if the implementation drifts from it | — |
| NFR-MNT6 | Conventional commits + CHANGELOG | — |

## 12. Portability and developer experience

| ID | Requirement |
|---|---|
| NFR-DX1 | `docker compose up` starts the API, worker, Postgres, Redis and Mailpit, with seed data (2 demo tenants). |
| NFR-DX2 | `.env.example` documents every variable; the app fails fast on a missing or invalid config (validated with zod). |
| NFR-DX3 | The same Docker images run locally and on AWS (ECS Fargate or EKS; decided in stage 8). |
| NFR-DX4 | Zero to running locally in under 10 minutes by following the README. |

## 13. Release gates (summary)

A build ships only if **all** of these pass:

1. `test:isolation`: 0 cross-tenant leaks, including with Layer 2 disabled.
2. The RLS coverage check: every tenant table has an enabled and forced policy.
3. Unit + integration tests pass, and coverage thresholds are met.
4. The OpenAPI contract check passes.
5. 0 high or critical vulnerabilities; 0 secrets found.
