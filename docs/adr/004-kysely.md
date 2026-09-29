# ADR-004 — Kysely for data access and migrations

| Status | Accepted |
|---|---|
| Date | 2026-09-28 |
| Deciders | Digvijay Singh |

## Context
RLS needs per-transaction `set_config` on the same connection that runs the queries. We want type safety and SQL we can reason about.

## Decision
Use Kysely with the `pg` driver. Types are generated from the database (`kysely-codegen`). Migrations are SQL-first Kysely migrations.

## Consequences
- ✅ `db.transaction().execute(trx => …)` gives explicit control of the connection, so `set_config` and the queries share it.
- ✅ Type-safe queries without ORM magic; easy to `EXPLAIN`.
- ⚠️ No relations or automatic joins; repositories write joins explicitly.

## Alternatives considered
- **Prisma:** interactive transactions and connection handling make per-request RLS awkward, and the query engine hides the SQL.
- **Drizzle:** also viable; Kysely was chosen for its maturity with raw-SQL escape hatches in migrations.
