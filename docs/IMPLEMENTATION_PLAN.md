# DSA OS — Implementation Plan

> Master task ledger and phase index.
> This document is the concise execution guide for the implementation agent.

---

## Architecture Summary

- **Frontend**: React 18 + TypeScript + Vite, CSS custom properties (Graphite Ledger design)
- **Backend**: Python 3.11 + FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2
- **Database**: PostgreSQL 16 with Row-Level Security
- **Storage**: MinIO (S3-compatible, private, signed URLs)
- **Queue**: ARQ (async Redis queue)
- **Auth**: JWT (access + refresh) with Argon2id password hashing and `auth_version` revocation
- **Deployment**: Docker Compose (pilot), Kubernetes-ready

---

# RELEASE 1 IMPLEMENTATION BOUNDARY

Release 1 is an operational platform for direct selling agents focusing strictly on case tracking, document handling, and payout reconciliation.

### Out of Scope for Release 1
Release 1 must **NOT** implement:
- **Lender API integrations** — all lender applications and status movements are tracked manually or via internal status forms
- **Credit decisioning** — no automated underwriting or loan approval algorithms
- **Automated credit scoring** — no direct bureau sync (CIBIL/Equifax); credit scores are recorded manually if obtained
- **External/cloud OCR** — customer documents must never leave DSA-controlled infrastructure
- **Customer-facing loan offers** — DSA OS is an internal operating platform, not a customer borrowing portal
- **E-sign / e-mandate** — physical or lender-managed signing workflows
- **EMI collection** — repayment tracking belongs to lenders, not DSAs
- **Accounting-system integration** — financial ledger sync is handled via CSV/Excel exports
- **Native mobile application** — responsive web app (usable >=360px) only
- **WhatsApp Business automation** — no automated bots or webhooks; manual intake tags only
- **Full dealer-facing external portal** — internal DSA operational use only

Architecture and data models are designed to be future-ready for these capabilities, but they must not become implementation tasks in Release 1.

---

## Phase Index

| Phase | Title | Depends On | Review Gate | Status |
|---|---|---|---|---|
| [PH-00](phase-00-foundation.md) | Foundation | — | — | TODO |
| [PH-01](phase-01-auth-tenancy.md) | Auth, Tenancy, RBAC | PH-00 | SECURITY-01 | TODO |
| [PH-02](phase-02-core-domain.md) | Core Domain | PH-01 | — | TODO |
| [PH-03](phase-03-documents.md) | Documents | PH-02 | SECURITY-02 | TODO |
| [PH-04](phase-04-lender-workflow.md) | Lender Applications and Workflow | PH-03 | — | TODO |
| [PH-05](phase-05-pdd-sla.md) | PDD and SLA Tracking | PH-04 | — | TODO |
| [PH-06](phase-06-payout.md) | Payout Engine | PH-04, PH-05 | — | TODO |
| [PH-07](phase-07-reconciliation.md) | Reconciliation | PH-06 | MONEY-01 | TODO |
| [PH-08](phase-08-dashboard.md) | Dashboards and Reports | PH-02..PH-07 | — | TODO |
| [PH-09](phase-09-notifications.md) | Notifications | PH-04..PH-07 | — | TODO |
| [PH-10](phase-10-hardening.md) | Hardening | PH-00..PH-09 | FINAL-01 | TODO |

---

## Task Ledger

### PH-00 — Foundation

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-00-T01 | Initialize backend project (FastAPI, pyproject.toml, app structure) | — | TODO |
| PH-00-T02 | Initialize frontend project (Vite, React, TypeScript) | — | TODO |
| PH-00-T03 | Create Docker Compose (PostgreSQL, Redis, MinIO, backend, frontend) | — | TODO |
| PH-00-T04 | Configure Alembic with dual-role migration pattern | PH-00-T01 | TODO |
| PH-00-T05 | Create database roles (dsaos_migrator, dsaos_app, dsaos_readonly) | PH-00-T03 | TODO |
| PH-00-T06 | Create organizations table and initial migration | PH-00-T04 | TODO |
| PH-00-T07 | Implement health endpoints and middleware (CORS, headers, request ID) | PH-00-T01 | TODO |
| PH-00-T08 | Set up design system tokens (CSS custom properties, IBM Plex Sans) | PH-00-T02 | TODO |
| PH-00-T09 | Create frontend app shell with sidebar layout | PH-00-T08 | TODO |
| PH-00-T10 | Configure CI (linting, type checking, tests) | PH-00-T01, PH-00-T02 | TODO |

### PH-01 — Auth, Tenancy, RBAC

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-01-T01 | Create users table with migration (including auth_version) and RLS | PH-00 | TODO |
| PH-01-T02 | Implement JWT authentication (login, refresh, logout) with auth_version check | PH-01-T01 | TODO |
| PH-01-T03 | Implement password hashing (Argon2id) and account lockout | PH-01-T02 | TODO |
| PH-01-T04 | Implement RBAC middleware and permission dependencies | PH-01-T02 | TODO |
| PH-01-T05 | Implement tenant isolation middleware (contextvars + session var) | PH-01-T02 | TODO |
| PH-01-T06 | Implement SQLAlchemy auto-filtering and auto-setting of org_id | PH-01-T05 | TODO |
| PH-01-T07 | Create RLS policies on users table with FORCE ROW LEVEL SECURITY | PH-01-T01 | TODO |
| PH-01-T08 | Create audit_log table with append-only enforcement | PH-01-T01 | TODO |
| PH-01-T09 | Implement audit logging service and event integration | PH-01-T08 | TODO |
| PH-01-T10 | Implement rate limiting (Redis-backed) | PH-01-T02 | TODO |
| PH-01-T11 | Implement user management API (create, deactivate, re-role) with immediate revocation (auth_version increment) | PH-01-T04 | TODO |
| PH-01-T12 | Create frontend login page and auth context | PH-01-T02 | TODO |
| PH-01-T13 | Create user management UI (Owner only) | PH-01-T11 | TODO |
| PH-01-T14 | Create audit log viewer UI | PH-01-T09 | TODO |
| PH-01-T15 | Write tenant isolation test suite (6+ scenarios) | PH-01-T07 | TODO |
| PH-01-T16 | Write RBAC test suite (full permission matrix) | PH-01-T04 | TODO |
| PH-01-T17 | Write authentication and immediate revocation test suite (deactivation, role change, lockout) | PH-01-T02..T03 | TODO |
| PH-01-T18 | Seed demo organizations and users | PH-01-T11 | TODO |
| | **Review Gate: SECURITY-01 (Tenant + RBAC + Revocation)** | PH-01-T15..T17 | TODO |

### PH-02 — Core Domain

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-02-T01 | Create parties table, service, API with encryption and dedup | PH-01 | TODO |
| PH-02-T02 | Create sources table, service, API | PH-01 | TODO |
| PH-02-T03 | Create cases table, service, API with auto case_no and state machine | PH-02-T01, PH-02-T02 | TODO |
| PH-02-T04 | Create vehicles table, service, API with registration validation | PH-02-T03 | TODO |
| PH-02-T05 | Implement consent recording service | PH-02-T01 | TODO |
| PH-02-T06 | Implement status history and case timeline | PH-02-T03 | TODO |
| PH-02-T07 | Implement masked field reveal with audit | PH-02-T01 | TODO |
| PH-02-T08 | Create RLS policies on all core domain tables | PH-02-T01..T04 | TODO |
| PH-02-T09 | Build case list page with filters and table | PH-02-T03 | TODO |
| PH-02-T10 | Build case creation form (6 mandatory fields, mobile-optimized) | PH-02-T03 | TODO |
| PH-02-T11 | Build case detail page (dossier, vehicle, source, timeline) | PH-02-T03 | TODO |
| PH-02-T12 | Build party list/detail pages with masked fields | PH-02-T01 | TODO |
| PH-02-T13 | Build source management pages | PH-02-T02 | TODO |
| PH-02-T14 | Build shared components (DataTable, StatusChip, CurrencyDisplay, etc.) | PH-02-T09 | TODO |
| PH-02-T15 | Write core domain test suite | PH-02-T01..T06 | TODO |
| PH-02-T16 | Seed demo parties, cases, sources | PH-02-T15 | TODO |

### PH-03 — Documents

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-03-T01 | Create document tables and seed document types (with quarantine fields/status) | PH-02 | TODO |
| PH-03-T02 | Implement checklist engine (rule evaluation) | PH-03-T01 | TODO |
| PH-03-T03 | Implement quarantine upload pipeline (pre-signed URL to quarantine/, confirm, isolated storage) | PH-03-T01 | TODO |
| PH-03-T04 | Implement async ARQ validation worker (ClamAV malware scan, EXIF stripping, MIME magic byte validation) | PH-03-T03 | TODO |
| PH-03-T05 | Implement safe idempotent promotion to canonical storage on pass; purge/isolate on failure | PH-03-T04 | TODO |
| PH-03-T06 | Implement signed download URL with audit logging; assert quarantined/unvalidated files cannot be downloaded | PH-03-T01 | TODO |
| PH-03-T07 | Implement document status workflow, version management, and daily quarantine cleanup job | PH-03-T01 | TODO |
| PH-03-T08 | Implement request message generation | PH-03-T02 | TODO |
| PH-03-T09 | Build document checklist UI, upload components with processing indicators | PH-03-T02 | TODO |
| PH-03-T10 | Build document viewer with mobile camera capture | PH-03-T06 | TODO |
| PH-03-T11 | Write document quarantine & security test suite (infected, unvalidated, canonical promotion, cross-tenant) | PH-03-T03..T06 | TODO |
| | **Review Gate: SECURITY-02 (Quarantine & Document Security)** | PH-03-T11 | TODO |

### PH-04 — Lender Applications and Workflow

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-04-T01 | Create lenders table, service, API | PH-02 | TODO |
| PH-04-T02 | Create lender applications table, service, API | PH-04-T01 | TODO |
| PH-04-T03 | Implement application status machine with transition validation | PH-04-T02 | TODO |
| PH-04-T04 | Implement document gate for Applied transition | PH-03, PH-04-T03 | TODO |
| PH-04-T05 | Implement winning application constraint and disbursal validation | PH-04-T02 | TODO |
| PH-04-T06 | Create tasks (follow-ups) table, service, API | PH-02 | TODO |
| PH-04-T07 | Implement SLA computation and stuck detection | PH-04-T03 | TODO |
| PH-04-T08 | Build lender application UI with side-by-side comparison | PH-04-T02 | TODO |
| PH-04-T09 | Build workflow configuration UI (SLA, transitions) | PH-04-T07 | TODO |
| PH-04-T10 | Build follow-up task UI | PH-04-T06 | TODO |
| PH-04-T11 | Write workflow and business rule test suite | PH-04-T03..T07 | TODO |

### PH-05 — PDD and SLA

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-05-T01 | Create PDD items table, service, API | PH-04 | TODO |
| PH-05-T02 | Implement auto-creation of PDD items on disbursal | PH-05-T01 | TODO |
| PH-05-T03 | Build PDD board UI with ageing buckets | PH-05-T01 | TODO |
| PH-05-T04 | Write PDD test suite | PH-05-T02 | TODO |

### PH-06 — Payout Engine

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-06-T01 | Create payout rules table, service, API | PH-04 | TODO |
| PH-06-T02 | Implement payout computation engine (percent, flat, slab) | PH-06-T01 | TODO |
| PH-06-T03 | Implement expectation auto-creation on disbursal | PH-06-T02, PH-04-T05 | TODO |
| PH-06-T04 | Implement no-rule flagging and attention list | PH-06-T03 | TODO |
| PH-06-T05 | Implement gating mechanism (Held -> Due on PDD complete) | PH-06-T03, PH-05 | TODO |
| PH-06-T06 | Implement splits with total constraint | PH-06-T03 | TODO |
| PH-06-T07 | Implement override with mandatory reason and audit | PH-06-T03 | TODO |
| PH-06-T08 | Build payout rules management UI | PH-06-T01 | TODO |
| PH-06-T09 | Build expectations and attention list UI | PH-06-T04 | TODO |
| PH-06-T10 | Build split editor UI | PH-06-T06 | TODO |
| PH-06-T11 | Write payout engine test suite (90%+ coverage) | PH-06-T02..T07 | TODO |

### PH-07 — Reconciliation

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-07-T01 | Create reconciliation tables and APIs | PH-06 | TODO |
| PH-07-T02 | Implement statement import with dry-run and column mapping | PH-07-T01 | TODO |
| PH-07-T03 | Implement auto-matching engine with variance classification | PH-07-T01 | TODO |
| PH-07-T04 | Implement manual receipt entry and matching | PH-07-T01 | TODO |
| PH-07-T05 | Implement outstanding report | PH-07-T03 | TODO |
| PH-07-T06 | Implement clawback tracking | PH-07-T01 | TODO |
| PH-07-T07 | Build reconciliation UI (import wizard, matching, outstanding) | PH-07-T02..T05 | TODO |
| PH-07-T08 | Write reconciliation test suite | PH-07-T02..T06 | TODO |
| | **Review Gate: MONEY-01** | PH-06-T11, PH-07-T08 | TODO |

### PH-08 — Dashboards and Reports

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-08-T01 | Implement dashboard aggregation queries | PH-02..PH-07 | TODO |
| PH-08-T02 | Implement KPI computation service (PRD 9.1 formulas) | PH-08-T01 | TODO |
| PH-08-T03 | Implement Today view service | PH-04..PH-07 | TODO |
| PH-08-T04 | Implement source report service | PH-02, PH-06 | TODO |
| PH-08-T05 | Implement CSV/Excel export with permissions and audit | PH-08-T01 | TODO |
| PH-08-T06 | Build business overview dashboard page | PH-08-T01 | TODO |
| PH-08-T07 | Build Today view page | PH-08-T03 | TODO |
| PH-08-T08 | Build source report page | PH-08-T04 | TODO |
| PH-08-T09 | Write dashboard and KPI test suite | PH-08-T02 | TODO |

### PH-09 — Notifications

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-09-T01 | Create notification tables, engine, service | PH-04..PH-07 | TODO |
| PH-09-T02 | Implement event-to-notification mapping | PH-09-T01 | TODO |
| PH-09-T03 | Implement deduplication and delivery | PH-09-T02 | TODO |
| PH-09-T04 | Implement periodic notification jobs (overdue, stuck, expiring) | PH-09-T02 | TODO |
| PH-09-T05 | Build notification bell and panel UI | PH-09-T01 | TODO |
| PH-09-T06 | Write notification test suite | PH-09-T02..T04 | TODO |

### PH-10 — Hardening

| Task ID | Task | Depends | Status |
|---|---|---|---|
| PH-10-T01 | Implement TOTP 2FA | PH-01 | TODO |
| PH-10-T02 | Implement data import (parties, cases, sources) | PH-02 | TODO |
| PH-10-T03 | Implement DSAR and retention workflows | PH-02 | TODO |
| PH-10-T04 | Performance optimization (queries, indexes, caching) | PH-08 | TODO |
| PH-10-T05 | Configure monitoring and alerting | PH-00 | TODO |
| PH-10-T06 | Verify backup and restore | PH-00 | TODO |
| PH-10-T07 | Seed comprehensive demo data | PH-02..PH-07 | TODO |
| PH-10-T08 | Security audit and OWASP checklist | All | TODO |
| PH-10-T09 | Performance benchmarks (P95 response times) | PH-10-T04 | TODO |
| | **Review Gate: FINAL-01** | PH-10-T08, T09 | TODO |

---

## Review Gates

| Gate | After Phase | Focus | Blocker For |
|---|---|---|---|
| **SECURITY-01** | PH-01 | Auth, RLS, RBAC, immediate revocation (auth_version), tenant isolation tests | PH-02 |
| **SECURITY-02** | PH-03 | Document quarantine separation, malware scanning, signed URLs, canonical promotion | PH-04 |
| **MONEY-01** | PH-06 + PH-07 | Payout engine calculation accuracy, reconciliation auto-matching, override audit trail | PH-08 |
| **FINAL-01** | PH-10 | Full security audit, penetration checklist, performance benchmarks, backup verification | Production |

---

## Total Estimated Tasks: 113

- **Foundation and Security**: 28 tasks (PH-00: 10, PH-01: 18)
- **Core Domain**: 16 tasks (PH-02)
- **Documents**: 11 tasks (PH-03)
- **Lender and Workflow**: 15 tasks (PH-04: 11, PH-05: 4)
- **Payout and Reconciliation**: 19 tasks (PH-06: 11, PH-07: 8)
- **Dashboards and Notifications**: 15 tasks (PH-08: 9, PH-09: 6)
- **Hardening**: 9 tasks (PH-10)
