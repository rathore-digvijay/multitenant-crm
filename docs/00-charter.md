# 00 — Project Charter

| Field | Value |
|---|---|
| Project | multitenant-crm |
| Author / Owner | Digvijay Singh |
| Status | Approved v1.0 |
| Last updated | 2026-09-28 |

---

## 1. Purpose

A learning and portfolio project: a **multi-tenant insurance CRM for lead management**, built to production standards (docs, design, tests, deployment) by a single engineer.

The core engineering question the project answers:

> **Can a request from one tenant ever read or change a row that belongs to another tenant?**
> The goal is to make the answer "no" by construction, not by discipline.

## 2. Problem statement

Insurance companies, brokers and agencies receive leads from many sources (website forms, partners, campaigns). Leads are tracked in spreadsheets and chat apps, so:

- leads are lost or followed up late,
- nobody knows which sales person owns which lead,
- converted leads (policies) and their renewal dates aren't tracked, so renewals slip,
- owners have no visibility into team performance.

## 3. Solution overview

One application that serves many companies (**tenants**) from one database. Each tenant gets an isolated workspace with its own members, leads, policies and billing.

- Leads enter a tenant's workspace **via an API** (tenant-scoped API key) or a **sheet upload** (CSV/XLSX) from the app.
- The tenant's team works each lead through a status pipeline until it becomes a policy or is closed as lost.
- Converted policies are tracked, and renewal reminders are raised before expiry.

## 4. Users and roles

| Role | Count per tenant | Summary |
|---|---|---|
| **Owner** | Exactly 1 | Primary user. Creates the workspace, owns billing, manages everyone. |
| **Admin** | 0..n | Manages members, teams, settings and API keys. No billing ownership. |
| **Team Lead** | 0..n | Manages a team of sales persons; sees and reassigns the team's leads. |
| **Sales Person** | 0..n | Works the leads assigned to them. |

Permission detail is defined in the PRD (stage 1) as a single role → action matrix.

## 5. Scope — v1 (MVP)

**Tenancy and access**
- Tenant signup: creates the tenant and the owner membership in one transaction
- Invite members by email and role (single-use, expiring token)
- Role changes, with the single-owner rule enforced
- Teams (team lead + sales persons)

**Leads**
- Lead ingestion API (per-tenant API key)
- Bulk lead upload from a sheet (CSV/XLSX), with a per-row error report
- Manual lead creation from the app
- Sales persons see only the leads assigned to them
- Lead status pipeline, assignment, notes and activity history

**Policies and renewals**
- Convert a lead to a policy
- Renewal reminders before the policy's expiry date

**Billing**
- Seat-based plans (Free / Pro)
- Idempotent payment-provider webhooks

**Isolation (the core of the project)**
- Tenant resolved once, in middleware
- Scoped data layer
- Postgres row-level security (RLS) underneath
- A cross-tenant test suite

## 6. Non-goals (v1)

- Integrations with insurers (quotes, policy issuance)
- WhatsApp, SMS or email campaigns (only simple email notifications)
- AI features (lead scoring, chat agents)
- Mobile apps
- Custom fields and a custom pipeline per tenant
- SSO / SAML, and multiple regions

## 7. Success criteria

| # | Criterion |
|---|---|
| S1 | The cross-tenant test suite passes: every endpoint called with tenant A's credentials and tenant B's IDs returns 404. |
| S2 | With the app-level scoping deliberately disabled, RLS still blocks cross-tenant reads (proven by a test). |
| S3 | Replaying the same billing webhook N times produces exactly one effect. |
| S4 | A new tenant can sign up, invite a member and receive a lead via the API in under 5 minutes. |
| S5 | Every stage in this docs set is complete, and every significant decision has an ADR. |
| S6 | Runs locally with one command (docker compose); later deployed to AWS. |

## 8. Constraints and assumptions

- **Team:** 1 engineer (the author), learning while building.
- **Stack preference:** Node.js / TypeScript on the backend, PostgreSQL (needed for RLS).
- **Environment:** local (docker compose) during v1; AWS after v1 is complete.
- **Budget:** minimal. Prefer free tiers and the payment provider's test mode.
- **Timeline:** open, milestone-driven (set in stage 10).

## 9. Risks

| Risk | Mitigation |
|---|---|
| Scope creep (policies, renewals, billing, teams) | Strict v1 list; everything else goes in a "later" backlog |
| RLS pitfalls (owner bypass, pooled connections) | Covered in the data-model stage and by test S2 |
| Solo project stalls | Small milestones, each with a demo-able result |

## 10. Decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Lead sources | Both the API and a sheet upload (CSV/XLSX) in v1 |
| D2 | Lead visibility | A sales person sees only the leads assigned to them |
| D3 | Multiple tenants per user | Allowed: one user can belong to several tenants via `memberships` and switches between workspaces |
| D4 | Product name | `multitenant-crm` |
