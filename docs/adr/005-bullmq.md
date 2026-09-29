# ADR-005 — BullMQ on Redis for background jobs

| Status | Accepted |
|---|---|
| Date | 2026-09-28 |
| Deciders | Digvijay Singh |

## Context
We need background processing for sheet uploads, outbox relay, emails and daily renewal scans, with retries, a dead-letter queue, repeatable jobs and per-tenant concurrency limits.

## Decision
Use BullMQ on Redis 7. The transactional outbox (a Postgres table) feeds the queues, so enqueueing is consistent with commits.

## Consequences
- ✅ Retries with backoff, repeatable (cron) jobs, and a dashboard (bull-board).
- ✅ Per-tenant fairness through job groups or keyed concurrency.
- ⚠️ Redis becomes a required dependency (it is needed anyway for rate limits).

## Alternatives considered
- **pg-boss:** no Redis needed, but weaker fairness features and a less common choice on portfolios.
