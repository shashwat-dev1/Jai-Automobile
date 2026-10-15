# DSA OS — Handoff to Implementation Agent

> This document is the briefing for the agent that will execute the implementation plan.

---

## What This Project Is

DSA OS is a multi-tenant vehicle-loan operations platform for Direct Selling Agents in India. It tracks the full lifecycle: Lead -> Customer -> Case -> Documents -> Lender Applications -> Sanction -> Disbursal -> PDD -> Payout -> Reconciliation -> Closure.

**Product thesis: Never lose track of a case, and never lose a rupee of payout.**

It is NOT a generic CRM. It is NOT an AI loan-decisioning platform. It is an operational system for DSA back-offices.

---

## Sources of Truth

1. **`DSA_OS_PRD_v1.0.docx`** — Product requirements (goals, features, user journeys)
2. **`DSA_OS_SRS_v1.0.docx`** — Software requirements (testable requirements, state machines, business rules, role matrix)
3. **`AGENTS.md`** — Repository rules (mandatory reading, contains stop conditions)

**PRD/SRS take precedence** over design references, AI suggestions, and assumptions.

---

## Planning Artifacts to Read

Read these before writing any code:

| Priority | Document | Why |
|---|---|---|
| 1 | `AGENTS.md` | Mandatory rules, security requirements, stop conditions |
| 2 | `docs/IMPLEMENTATION_PLAN.md` | Phase order, task IDs, dependencies, review gates |
| 3 | `docs/plan/phase-00-foundation.md` | Start here — files to create, acceptance criteria |
| 4 | `docs/ARCHITECTURE.md` | Tech stack, module structure, patterns |
| 5 | `docs/DATA_MODEL.md` | All tables, relationships, indexes, state machines |
| 6 | `docs/API.md` | Endpoints, auth, validation, errors |
| 7 | `docs/SECURITY.md` | RLS patterns, encryption, test plan |
| 8 | `docs/DESIGN_SYSTEM.md` | Colors, typography, components, layouts |
| 9 | `docs/DATA_DICTIONARY.md` | SRS-required data dictionary: enums, types, formats |
| 10 | `docs/OPEN_QUESTIONS.md` | What's decided vs what needs demo data |
| 11 | `docs/decisions/` | ADRs for key technical choices |

---

## Execution Rules

### 1. Build in Phase Order

Phases are sequenced by dependency. Do not skip ahead. Each phase document contains:
- Objective, dependencies, requirements covered
- Exact database changes and migrations
- Backend modules and API endpoints
- Frontend routes and components
- Business rules, security implications
- Tests and acceptance criteria
- Definition of done
- Files expected to change/create

### 2. Respect Review Gates

| Gate | After | Must Pass Before |
|---|---|---|
| SECURITY-01 | PH-01 (Auth/Tenancy) | PH-02 |
| SECURITY-02 | PH-03 (Documents) | PH-04 |
| MONEY-01 | PH-06 + PH-07 (Payout + Reconciliation) | PH-08 |
| FINAL-01 | PH-10 (Hardening) | Production |

At each gate, pause and request human review of:
- Test results (especially cross-tenant, RBAC, and security tests)
- RLS policy coverage
- Audit completeness
- Business rule enforcement

### 3. Security First

- **RLS on every tenant table** with `FORCE ROW LEVEL SECURITY`
- **Application role** (`dsaos_app`) that does NOT own tables
- **No fake security** — real encryption, real RLS, real audit
- **Automated tests** proving cross-tenant access fails
- Read `docs/SECURITY.md` section 10 for the exact test specifications

### 4. Domain Separation

Do NOT collapse these entities:
- **Party** (person) ≠ **Case** (loan application context)
- **Case** can have multiple **Lender Applications**
- Only one Lender Application can be **winning**
- **Payout** belongs to the disbursed application, not to the customer directly

### 5. No Fake Functionality

- API responses must come from real database queries
- Dashboard metrics must be computed from actual data
- Payout calculations must use the real engine
- Test with the seed data module, not hardcoded mock responses

### 6. Configuration Over Code

Business-specific values are stored as data, not code:
- Lenders, products, document types
- SLA values, status transitions
- Payout rules, TDS rates, GST modes
- Checklist rules
- Notification preferences

### 7. Git Discipline

Use logical commits per the convention in `AGENTS.md`:
```
feat(auth): add authentication foundation
feat(tenancy): add tenant isolation
feat(cases): implement case lifecycle
```
Do not make one giant commit for an entire phase.

### 8. Documentation Updates

After each phase, update:
- `docs/PROGRESS.md` — mark phase status, record issues
- `docs/IMPLEMENTATION_PLAN.md` — update task statuses
- Other docs if implementation reveals needed changes

---

## Technology Stack Quick Reference

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router v6, TanStack Query, Zustand |
| Styling | Vanilla CSS with custom properties (Graphite Ledger tokens) |
| Font | IBM Plex Sans |
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16 with RLS |
| Migrations | Alembic |
| Storage | MinIO (S3-compatible) |
| Queue | ARQ (Redis-backed) |
| Cache | Redis |
| Auth | Custom JWT (access + refresh), Argon2id |
| Testing | pytest (backend), Vitest (frontend) |
| Linting | ruff (Python), ESLint (JS) |
| Deployment | Docker Compose |

---

## Stop Conditions

Per `AGENTS.md`, stop and request human review when:
- A security architecture decision is required
- A business rule cannot be safely inferred
- A PRD/SRS conflict cannot be resolved
- A destructive migration is required
- Real customer data would be needed
- An external integration is required but unspecified
- A major architecture change is proposed

---

## Current Status

> **Stitch Dashboard KPIs, All Leads Filtered Desk & Lead Profile Dossier: 100% COMPLETE.**
> - **Frontend**: 134/134 Vitest tests passing across 17 test suites with clean production build (`tsc -b && vite build` in 6.78s).
> - **Clickable Dashboard Affordances & Filter Routing**:
>   - All 6 KPI cards (`Leads`, `Active Calling`, `Interested`, `Follow-ups`, `Converted to Clients`, `Unassigned Leads`) are fully clickable with pointer cursor, tactile hover/active animations, keyboard accessibility (`Enter`/`Space`), and navigate to `/cases?view=...&range=...`.
>   - All 3 Due Today rows (`Unassigned leads`, `Follow-ups due today`, `Interested leads awaiting next step`) navigate directly to their operational lead views with exact counts matching the dashboard.
> - **Single Source of Truth (`caseFilters.ts`)**:
>   - Unified domain filter predicates shared between `dashboardDataService.ts` and `CaseListPage.tsx`. Zero mismatch between dashboard KPI badges, Due Today counters, status tab counts, and table rows.
> - **Stitch Design 1: All Leads Management Desk (`/cases`)**:
>   - Operations Console › Lead Management › All Leads breadcrumbs, total record pill, Conversion Velocity widget, Export CSV, and New Lead intake modal.
>   - Filter bar: live search across customer name, phone, ref, and vehicle registration; dropdowns for Telecaller, Loan Type, Referral Partner, and Date Range with clear filter reset.
>   - 6 Status tabs with real-time count pills (`All Leads`, `Active Calling`, `Interested`, `Follow-ups Due Today`, `Converted to Clients`, `Unassigned Leads`).
>   - Tabular layout with customer contact, loan specs, Stitch status badges, telecaller monograms, referral channel, and `Open Lead Profile →` row links.
>   - Pagination (`Showing X to Y of Z leads`, rows per page selector, pagination controls).
>   - Bottom 3 summary cards (`Lead Pipeline Health` in ₹Cr, `Telecaller Utilization` bar, `Top Partner Channel`) dynamically calculated from active data.
> - **Stitch Design 2: Complete Lead Profile Dossier (`/cases/:id`)**:
>   - Breadcrumbs (`Operations Console › Leads › {case_no}`), `← Back to Leads List` preserving filters.
>   - Lead Summary Header Card: squircle monogram initials avatar, quick action buttons (`Call Customer`, `Schedule Follow-up`, `Reassign`, `Update Status`), and 4-metric strip.
>   - Left column: Customer & Vehicle specifications, KYC Documents with regulatory masking notice and secure modal previewer/download, Referral partner attribution with partner ledger link.
>   - Right column: Assignment & fast reassignment (admin-only), Lifecycle stage progression selector, Next scheduled operational milestone card, and Calling activity timeline with modal to log calls and notes.
> - **RBAC & Security Enforced**:
>   - Admin: unrestricted access to all organization leads, assignment/reassignment controls, stage controls.
>   - Telecaller: scoped to assigned leads only; unauthorized detail view attempts return 403 Forbidden.
>   - Tenant isolation maintained across all Firestore sync and local storage operations.

---

## Production Deployment to Existing Vercel Project

1. Commit all changes with logical commit messages.
2. Push to `main` on `origin`.
3. Vercel automatically deploys the updated release to the live production project URL.

