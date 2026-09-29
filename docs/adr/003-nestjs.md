# ADR-003 — NestJS as the application framework

| Status | Accepted |
|---|---|
| Date | 2026-09-28 |
| Deciders | Digvijay Singh |

## Context
We need clear module boundaries, one place for guards (auth, permissions), interceptors (logging, tenant context) and error filters. The author already knows NestJS.

## Decision
Use NestJS 11 on the Fastify adapter.

## Consequences
- ✅ Guards map directly onto the single permission-matrix check (PRD R2).
- ✅ The same module graph runs as an HTTP app (`api`) and as an application context (`worker`).
- ⚠️ Dependency injection adds some ceremony; request-scoped providers are avoided (AsyncLocalStorage is used instead) for performance.

## Why the Fastify adapter
NestJS is a structure layer (modules, dependency injection, guards, interceptors) on top of an HTTP adapter, which is Express by default or Fastify.

| | NestJS + Express | NestJS + Fastify (chosen) |
|---|---|---|
| Throughput (hello-world benchmarks) | Baseline | ~2–3× |
| Built-in logger | ❌ | ✅ pino (matches NFR-OBS1) |
| JSON serialisation | `JSON.stringify` | Schema-based, faster |
| Middleware ecosystem | Largest | `@fastify/*` equivalents (helmet, cookie, rate-limit) |

The speed gain is secondary, because request time is dominated by Postgres. The deciding factors are the built-in pino logger and learning value. Switching back is cheap as long as code uses only NestJS APIs.

**Rules that follow from this choice**
- Use NestJS abstractions (guards, interceptors, pipes, filters); don't use raw `req`/`reply` in handlers.
- Enable `rawBody: true` for Razorpay HMAC verification.
- Use `@fastify/helmet` and `@fastify/cookie`. Multipart isn't needed, because uploads go through presigned S3 URLs.

## Alternatives considered
- **Plain Fastify:** lighter, but we would hand-build structure that NestJS already provides.
- **NestJS + Express:** equally valid, with a larger ecosystem; not chosen for the reasons above.
