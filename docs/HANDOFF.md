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

> **Public Referral Portal / New Lead Submission Updates: 100% COMPLETE.**
> - **Frontend**: 171/171 Vitest tests passing across 21 test suites with clean production build (`tsc -b && vite build` in 25.88s).
> - **Reordered Form Sections**: Exactly 1. Customer Details -> 2. Loan Type -> 3. Vehicle & Loan Details -> 4. Expected Loan Required Date -> 5. Vehicle Condition -> 6. Document Uploads (final section of form).
> - **Expected Loan Required Date**: Date picker with min=today, max=1 year; persisted to lead record and displayed in Admin Case Detail Dossier.
> - **Resilient PIN Autofill**: `pincodeService.ts` combines cache, official India Post API, comprehensive 60+ city offline directory, and regional prefix fallback with manual override editing.
> - **Hindi & English Localization**: Header switcher (`English` | `हिन्दी`) with complete dictionary coverage (`translations.ts`) preserving form state on toggle.
> - **Zero Sample Documents & Quarantined Badging**: Form starts completely empty; uploads display actual filename and `Uploaded (Quarantined)` status with genuine OCR pipeline.
>
> **Critical Bug Fix — Synchronize Leads, Customers, Referral Partners, and Status Changes: 100% COMPLETE.**
> - **Frontend**: 160/160 Vitest tests passing across 20 test suites with clean production build (`tsc -b && vite build` in 6.66s).
> - **Single Source of Truth**:
>   - Unified customer lifecycle rules in `isQualifyingCustomerStatus(status)` (`sanctioned`, `disbursed`, `pdd_pending`, `pdd_completed`, `completed`, `converted`).
>   - Implemented idempotent customer creation and linking `syncCustomerFromCase(caseItem)`: qualifying cases create/link customer party records in the `parties` collection; non-qualifying stages (`lead`, `in_calling`, `interested`, `callback_scheduled`) do not create customers.
>   - Implemented dynamic referral partner metrics enrichment `enrichReferralProfilesWithCaseMetrics(profiles, allCases)`: live derivation of `total_leads`, `interested_leads`, `converted_leads`, and `disbursed_leads` matched by `referral_profile_id`, `referral_partner_id`, mobile, or name.
>   - Synchronized all state changes (`POST /cases/:id/status`, `POST /cases/:id/call-activity`, `POST /cases/assign`) to Cloud Firestore via `syncCaseToCloud` and real-time `onSnapshot` listeners.
>   - Avoided full-page loading flashes on background sync in `CaseDetailPage.tsx` using background revalidation.
> - **Safe Cloud Repair**:
>   - Verified and repaired real records in Firestore: `case-jai-1792100336767` (Riddhi Sharma) updated to `status: 'disbursed'`, `call_outcome: 'interested'`, complete status history, linked `party_id: 'p-1792100336767'`.
>   - Created customer party record for Riddhi Sharma in Firestore `parties` collection (`p-1792100336767`).
>   - Updated partner `ref-p-1792100336766` (Santosh) in Firestore: `total_leads: 1, interested_leads: 1, converted_leads: 1`.
>   - Seeded baseline parties (`party-01`, `party-02`, `party-03`) to Firestore `parties` collection.
>
> **Today's Console Redesign — Admin Operations Workflow: 100% COMPLETE.**
> - **Frontend**: 152/152 Vitest tests passing across 19 test suites with clean production build (`tsc -b && vite build` in 6.78s).
> - **Operational Center**:
>   - Re-architected `/today` into the daily operational control center based on Stitch UI concepts (Desktop & Mobile).
>   - Derived all metrics and queues dynamically from live stored application cases (`todayDataService.ts` & `getStoredCases()`) with bi-directional Firestore synchronization.
>   - Obsolete elements cleanly removed (no back link, no "Daily Execution Cockpit", no "Open Telecaller Workspace" or "Inflow Cold Leads" buttons, no "Retry Callbacks" KPI).
>   - 4 Top KPI Cards (`New Leads`, `Unassigned Leads`, `Interested Prospects`, `Follow-ups Due Today`) with dynamic badges and live case view links.
>   - Section 1: Fresh unassigned incoming leads table with customer details, vehicle, loan amount, source badge, and instant telecaller assignment modal.
>   - Section 2: Two-column operational workspaces (Left: Unassigned Leads Backlog with urgency triage; Right: Follow-ups Due Today with time pills and lead links).
>   - Section 3: Telecaller Activity & Updates live feed with squircle initials avatars, call outcome badges, remarks, and interactive Administrative Attention review modal.
>   - Responsive design: Full desktop panoramic view and mobile segmented view (`Triage (N)`, `Activity Feed`, `Follow-ups (N)`).
>
> **Sidebar Simplification & Quick Lead Intake Updates: 100% COMPLETE.**
> - Exactly 10 retained menu items: `Dashboard`, `Today's Console`, `Leads`, `Quick Lead Intake`, `Telecaller Workspace`, `Referral Partners`, `Public Referral Portal`, `Borrowers & Customers`, `Team & Telecallers`, `Audit Trail`.
> - "Cold Leads & Files" renamed to "Leads" pointing to `/cases` (All Leads default view).
> - Quick Lead Intake source dropdown restricted to `Direct` vs `Referral`.
>
> **Stitch Dashboard KPIs, All Leads Filtered Desk & Lead Profile Dossier: 100% COMPLETE.**
> - All 6 KPI cards & Due Today rows connected to filtered lead lists.
> - Unified domain filter predicates in `caseFilters.ts`.
> - Strict RBAC, tenant isolation, and Firestore synchronization.

---

## Production Deployment to Existing Vercel Project

1. Commit all changes with logical commit messages.
2. Push to `main` on `origin`.
3. Vercel automatically deploys the updated release to the live production project URL.

