# 01 — Product Requirements Document (PRD)

| Field | Value |
|---|---|
| Project | multitenant-crm |
| Author / Owner | Digvijay Singh |
| Status | Approved v1.0 |
| Last updated | 2026-09-28 |
| Depends on | [00-charter.md](./00-charter.md) |

---

## 1. Overview

multitenant-crm is a multi-tenant lead management CRM for insurance businesses. Each tenant (a company) gets an isolated workspace in which its team captures leads, works them through a pipeline, converts them into policies, and is reminded before those policies come up for renewal.

**Delivery approach:** API-first (REST + OpenAPI/Swagger). A minimal Next.js UI follows once the API is stable.

## 2. Glossary

| Term | Meaning |
|---|---|
| Tenant | A company using the system. It has one workspace. |
| Workspace | A tenant's isolated space: members, teams, leads, policies, billing |
| Membership | A user's link to a tenant, carrying a role. One user can have many memberships. |
| Lead | A prospective customer for an insurance product |
| Policy | A lead that has converted, recorded with its policy details |
| Renewal reminder | A notification raised before a policy's end date |
| Seat | One active membership, counted for billing |
| API key | A tenant-scoped secret used by external systems to push leads |

## 3. Personas

| Persona | Goals | Pain today |
|---|---|---|
| **Owner** (e.g. the founder of a broking firm) | Visibility into the pipeline and the team; control of billing | No single view; renewals slip |
| **Admin** (ops manager) | Onboard the team, connect lead sources, keep data clean | Manual lead distribution in spreadsheets |
| **Team Lead** | Distribute leads fairly; track the team's follow-ups | Can't see who's sitting on which lead |
| **Sales Person** | A clear daily list of leads to call; never miss a renewal | Leads arrive over WhatsApp and get lost |
| **Integrator** (a developer at the tenant) | Push leads from website forms or partners with a simple API | No API |

## 4. Roles and permission matrix

Scope key: **T** = the whole tenant, **Tm** = own team, **Own** = assigned to self, **—** = not allowed.

| Action | Owner | Admin | Team Lead | Sales |
|---|---|---|---|---|
| View / update tenant settings | T | T | — | — |
| Manage billing and plan | T | — | — | — |
| Transfer ownership | T | — | — | — |
| Invite member | T | T | — | — |
| Change member role | T | T¹ | — | — |
| Remove member | T | T¹ | — | — |
| Create / edit teams | T | T | — | — |
| Manage API keys | T | T | — | — |
| Create lead (manual) | T | T | Tm | Own² |
| Upload lead sheet | T | T | Tm³ | — |
| View leads | T | T | Tm | Own |
| Assign / reassign lead | T | T | Tm | — |
| Update lead status / add note | T | T | Tm | Own |
| Convert lead to policy | T | T | Tm | Own |
| View policies | T | T | Tm | Own |
| Delete lead (soft) | T | T | — | — |
| View dashboard | T | T | Tm | Own |
| View activity history | T | T | Tm | Own |

¹ An admin cannot change or remove the owner, and cannot promote anyone to owner.
² A lead a sales person creates is auto-assigned to them.
³ Leads uploaded by a team lead are placed in their team, unassigned.

**Rules**
- R1: Exactly one owner per tenant, always. Ownership moves only through an explicit transfer, which demotes the old owner to admin in the same transaction.
- R2: Permission checks happen in one middleware, driven by this matrix. Handlers never check roles themselves.
- R3: A resource outside the caller's scope returns **404**, never 403.

## 5. Functional requirements

### 5.1 Tenancy and onboarding

| ID | Requirement |
|---|---|
| FR-T1 | A user signs up with email and password, and creates a tenant (name and a unique slug). The tenant and the owner membership are created in **one transaction**. |
| FR-T2 | A user can belong to several tenants and switch between them. The active tenant comes from a signed token claim, never from the request body or query string. |
| FR-T3 | Owner or admin invites by email and role. The system generates a single-use token with a 7-day expiry and emails it. |
| FR-T4 | Accepting an invite creates the membership and sets `accepted_at`. A second accept fails. An expired token fails. |
| FR-T5 | If the invitee has no account, they create one during accept. If they already have one, the membership is added to that account. |
| FR-T6 | Invites respect the plan's seat limit: pending invites plus active members must not exceed the seats. |
| FR-T7 | A member can be removed. Their open leads become unassigned in their team. |
| FR-T8 | Pending invites can be revoked. |

### 5.2 Teams

| ID | Requirement |
|---|---|
| FR-TM1 | Owner or admin creates teams and sets one team lead per team. |
| FR-TM2 | A sales person belongs to exactly one team. A team lead leads exactly one team. |
| FR-TM3 | Moving a sales person to another team keeps their assigned leads assigned to them. The team on each lead follows the assignee. |

### 5.3 Leads

**Fields**

| Field | Required | Notes |
|---|---|---|
| name | ✅ | |
| phone | ✅ | Normalised to E.164 (e.g. +91XXXXXXXXXX) |
| email | | |
| product_type | ✅ | `motor`, `health`, `life`, `travel` |
| city | | |
| source | ✅ | `api`, `upload`, `manual`, plus a free-text sub-source (e.g. "website", "partner-x") |
| notes | | |
| meta | | Free-form JSON (≤ 8 KB) for extra fields from the source |
| status | system | See 5.4 |
| assignee_id, team_id | system | |
| duplicate_of | system | Link to the earlier lead with the same phone |

| ID | Requirement |
|---|---|
| FR-L1 | **Ingestion API:** `POST /v1/leads` authenticated with a tenant API key. The key identifies the tenant; the body cannot. |
| FR-L2 | The ingestion API accepts an `Idempotency-Key` header. A repeat of the same key within 24 hours returns the original response and creates nothing. |
| FR-L3 | **Sheet upload:** the app offers a downloadable template (CSV/XLSX). Uploads take up to 5,000 rows and are processed in the background. |
| FR-L4 | After an upload, the user sees a summary (created, duplicates, failed) and can download a per-row error report. |
| FR-L5 | **Duplicates:** a lead whose phone number matches any existing lead in the same tenant (open, converted or lost) is created with `duplicate_of` pointing to the most recent match, and flagged. It is not rejected. A match on a converted lead is labelled "existing customer". |
| FR-L6 | Manual create from the app, with the same validation. |
| FR-L7 | Lists support filters (status, assignee, team, product, source, date range), search (name, phone, email) and cursor pagination. |
| FR-L8 | Soft delete only (owner or admin). |

### 5.4 Lead pipeline

```
New → Contacted → Interested → Quote Sent → Converted
  \________\___________\____________\______→ Lost (reason required)
```

| ID | Requirement |
|---|---|
| FR-P1 | Allowed moves: forward one or more steps, or to **Lost** from any open status. **Converted** and **Lost** are terminal. |
| FR-P2 | Reopening a Lost lead (back to Contacted) is allowed for owner, admin and team lead only. |
| FR-P3 | Lost requires a reason: `not_interested`, `price`, `bought_elsewhere`, `unreachable`, `invalid`, `other` (with text). |
| FR-P4 | Moving to Converted requires creating a policy (5.6) in the same action. |

### 5.5 Assignment

| ID | Requirement |
|---|---|
| FR-A1 | Owner, admin or team lead assigns a lead to a sales person (a team lead only within their own team). |
| FR-A2 | Optional **round-robin** per team: when it's on, new unassigned leads in that team go to the team's available sales persons in turn. |
| FR-A4 | Each sales person has an **availability** toggle (available or unavailable), set by themselves, their team lead, an admin or the owner. Round-robin skips unavailable members. If nobody is available, the lead stays unassigned in the team and the team lead is notified. |
| FR-A3 | The assignee is notified in the app on assignment. |

### 5.6 Policies and renewals

| ID | Requirement |
|---|---|
| FR-PO1 | A policy captures: policy number, insurer, product type, premium (INR), start date and end date. It links to the source lead. |
| FR-PO2 | Policy number is unique within a tenant. |
| FR-PO3 | Renewal reminders are sent **30, 15 and 7 days** before the end date to the policy's assigned sales person, both in the app and by email. |
| FR-PO4 | Each reminder is sent at most once per policy per threshold (idempotent scheduler). |
| FR-PO5 | Owner, admin and team lead see an "upcoming renewals" list within their scope. |

### 5.7 Activity history

| ID | Requirement |
|---|---|
| FR-H1 | Every change to a lead or policy (create, status, assignee, note, field edit) is logged with the actor, the time, and old and new values. |
| FR-H2 | History is append-only and visible within the viewer's scope. |

### 5.8 Notifications

| ID | Requirement |
|---|---|
| FR-N1 | In-app notifications: lead assigned, renewal due, upload finished. |
| FR-N2 | Email: invite, renewal due. The provider is pluggable; locally it is a mail catcher (e.g. Mailpit). |

### 5.9 Dashboard

| ID | Requirement |
|---|---|
| FR-D1 | Lead counts by status, for a date range, within the viewer's scope. |
| FR-D2 | Conversion rate (converted ÷ closed) and total premium converted. |
| FR-D3 | A per-sales-person table: assigned, contacted, converted, lost (owner, admin and team lead). |

### 5.10 API keys

| ID | Requirement |
|---|---|
| FR-K1 | Owner or admin creates named API keys. The full key is shown **once**; only a hash is stored. |
| FR-K2 | Keys can be revoked. The last-used time is recorded. |
| FR-K3 | Keys are rate-limited per key (default 60 requests a minute). |

### 5.11 Billing

| Plan | Seats | Leads / month | Price |
|---|---|---|---|
| Free | 3 | 500 | ₹0 |
| Pro | Unlimited (billed per seat) | Unlimited | Per seat per month (test mode) |

| ID | Requirement |
|---|---|
| FR-B1 | The owner upgrades or downgrades through Razorpay Subscriptions checkout (test mode). |
| FR-B2 | Subscription state changes only from **verified webhooks**, processed idempotently (the provider's event id is stored once, in the same transaction as the effect). |
| FR-B3 | Over the Free limit: new invites are blocked, and ingestion returns `402` with a clear message. Existing data is never blocked. |
| FR-B4 | A downgrade with more members than the seat limit is refused until members are removed. |

## 6. User stories (key flows)

**US-1 — Owner creates a workspace**
As a new user, I want to create my company's workspace, so that my team can start managing leads.
- Given valid details, the tenant and my owner membership exist and I land in my workspace.
- Given a slug that's already taken, nothing is created and I get a clear error.

**US-2 — Admin invites a sales person**
As an admin, I want to invite a sales person by email, so they can join my workspace.
- The invite email contains a link that expires in 7 days.
- Accepting twice fails the second time.
- When the tenant is at its seat limit, the invite is refused.

**US-3 — Website pushes a lead**
As an integrator, I want to POST a lead with our API key, so website enquiries land in the CRM.
- A valid key and body returns `201` with the lead id, and the lead appears in the tenant.
- The same `Idempotency-Key` sent twice creates one lead.
- A `tenant_id` in the body is ignored; only the key decides the tenant.
- A revoked key returns `401`.

**US-4 — Team lead uploads a sheet**
As a team lead, I want to upload a spreadsheet of leads, so I don't enter them one by one.
- 5,000 valid rows are processed in the background, and I'm notified when it finishes.
- Rows with errors are skipped and listed in the downloadable report, with the reason for each.

**US-5 — Sales person works their day**
As a sales person, I want to see only my assigned leads, sorted by newest, so I know whom to call.
- I never see another sales person's leads, even by guessing an id (I get a 404).
- I can move a lead to Contacted or Interested, and to Lost with a reason.

**US-6 — Converting a lead**
As a sales person, I want to convert a lead and record the policy, so renewals are tracked.
- Converting without policy details is refused.
- A duplicate policy number in the tenant is refused.

**US-7 — Renewal reminder**
As a sales person, I want a reminder 30, 15 and 7 days before a policy expires.
- Each reminder is sent once, even if the scheduler runs twice.

**US-8 — Owner transfers ownership**
As the owner, I want to transfer ownership to an admin.
- After the transfer there is still exactly one owner, and I become an admin.

**US-9 — Tenant isolation (system story)**
As any tenant, my data is never readable or writable by another tenant.
- Every endpoint called with tenant A's credentials and tenant B's resource ids returns 404.

## 7. Out of scope (v1)

Insurer integrations, WhatsApp or SMS, AI features, mobile apps, custom fields or a custom pipeline per tenant, SSO, exports beyond the upload error report, multiple currencies, and multiple regions.

## 8. Assumptions

- A1: All money is in INR. All times are stored in UTC and shown in IST.
- A2: Email verification at signup is simulated in local development (a mail catcher).
- A3: Razorpay is used in test mode only.
- A4: The UI comes after the API. The API is complete and usable through Swagger alone.

## 9. Decisions

| # | Topic | Decision |
|---|---|---|
| D5 | Payment provider | Razorpay (Subscriptions + webhooks, test mode) |
| D6 | Duplicate scope | A phone match on any lead, including converted ones, is flagged as a duplicate; a converted match is labelled "existing customer" |
| D7 | Round-robin | Skips unavailable sales persons, using a per-member availability toggle (FR-A4) |
