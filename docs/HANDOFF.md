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

> **Phase 1 Rebuild & Codebase Cleanup 100% COMPLETE. Production Vercel Deployment Ready.**
> - **Backend**: 159/159 pytest tests passing with 0 failures, 0 regressions.
> - **Frontend**: 68/68 Vitest tests passing across 11 test suites, clean production build (`tsc -b && vite build` in ~10.6s).
> - **Phase 1 Workflows Validated**:
>   - Workflow A: Admin Cold Leads & Excel Ingestion (`/cases`)
>   - Workflow B: Telecaller Focused Workspace (`/telecaller`)
>   - Workflow C: Guest Referral Intake Flow (`/referral` & `/refer/:orgSlug`)
>   - Workflow D: Referral Analysis & Commissions (`/referrals`)
>   - White-label Dynamic Branding & Multi-Tenancy

---

## Next Action: Controlled Production Deployment to Existing Vercel Project

1. Commit all Phase 1 changes with logical commit messages.
2. Push to `main` on `https://github.com/shashwat-dev1/Jai-Automobile.git`.
3. Vercel automatically deploys the updated Phase 1 release to the live production project URL.
4. Verify production deployment and retain rollback checkpoint `checkpoint-pre-phase1`.

