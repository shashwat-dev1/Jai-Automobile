# DSA OS — Pre-Implementation Remediation Report

> **Status:** Remediation Complete  
> **Date:** 2026-10-04  
> **Phase:** Planning Remediation  

---

## Executive Summary

A comprehensive pre-implementation remediation audit was conducted across the DSA OS planning and architecture packages to address all security, scope, traceability, toolchain, and API gaps identified prior to the start of implementation. 

All remediations were executed **without redesigning the core product architecture and without expanding Release 1 scope**. The system remains a modular monolith (FastAPI + React/TypeScript/Vite + PostgreSQL 16 with RLS + MinIO private object storage + ARQ background workers).

---

## 1. Changes Made

| Area | Artifacts Modified / Created | Summary of Changes |
|---|---|---|
| **Document Upload Quarantine** | `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATA_MODEL.md`, `docs/API.md`, `docs/plan/phase-03-documents.md`, `docs/decisions/ADR-003-object-storage.md`, `AGENTS.md`, `docs/IMPLEMENTATION_PLAN.md` | Replaced direct-to-canonical upload with strict quarantine storage prefix, asynchronous ARQ validation worker (ClamAV + magic bytes + EXIF stripping), safe promotion on pass, and automatic 24h quarantine cleanup. Canonical download APIs strictly reject unvalidated/quarantined files. |
| **Release-1 Scope Discipline** | `Designs/dsa_os_loan_file_detail_los_10482/code.html`, `Designs/dsa_os_operational_file_pipeline/code.html`, `Designs/dsa_os_business_overview_dashboard/code.html`, `docs/DESIGN_SYSTEM.md`, `AGENTS.md`, `docs/IMPLEMENTATION_PLAN.md` | Removed or re-labeled out-of-scope concepts in design mockups (`94% Fit` → `Application Progress`, `Sanction Probability` → `Application Status`, `Lender API Gateways` → `Applications: Active`, `WhatsApp Bot Ingestion` → `Source: WhatsApp / Manual Intake`, `CIBIL Pull` → `Credit Details: Manually Recorded`). Added explicit `# RELEASE 1 IMPLEMENTATION BOUNDARY` section to master implementation plan and `AGENTS.md` scope rule. |
| **Synthetic Demo Data Standards** | All design `code.html` mockups, `docs/DESIGN_SYSTEM.md` | Added prominent `SYNTHETIC DEMO DATA — NOT REAL CUSTOMER DATA` banners. Sanitized phone numbers to synthetic `+91 90000 00000`, vehicle registration to `RJ-00-XX-0000`, and codified synthetic data patterns in Design System. |
| **JWT / Session Revocation Semantics** | `docs/SECURITY.md`, `docs/DATA_MODEL.md`, `docs/decisions/ADR-005-authentication.md`, `docs/plan/phase-01-auth-tenancy.md`, `docs/IMPLEMENTATION_PLAN.md` | Introduced `auth_version` integer on `users` table and token payload. Administrative user deactivation, role downgrade, or forced logout increments `auth_version`, rendering all existing access tokens immediately invalid. Added explicit security unit tests. |
| **Requirements Traceability** | `docs/REQUIREMENTS_TRACEABILITY.md` | Mapped all previously unmapped SRS requirements: `FR-OCR-001..004`, `IF-1..12`, `NFR-MNT-001..002`, `NFR-POR-001`, `NFR-USA-001..002` with explicit scope assignment (`MVP / RELEASE 1`, `PLANNED / POST-MVP`, `ARCHITECTURE CONSTRAINT`, `DEFERRED`, `NOT APPLICABLE`) and detailed justification. |
| **Toolchain Version Pinning** | `docs/decisions/ADR-006-toolchain-versions.md` | Created ADR-006 pinning exact versions for Python (3.11.9), Node.js (20 LTS), FastAPI (0.115), Pydantic (2.9), SQLAlchemy (2.0.35+), PostgreSQL (16), Redis (7.2), MinIO, ClamAV, React (18.3.1), TypeScript (5.5), Vite (5.4), ARQ (0.26), and test runners. |
| **Background Worker Ambiguity** | `docs/ARCHITECTURE.md`, `docs/decisions/ADR-004-background-jobs.md`, `docs/decisions/ADR-006-toolchain-versions.md` | Explicitly removed Celery ambiguity; ARQ is the sole selected background worker framework for Release 1. Celery is documented strictly as a future post-pilot migration path. |
| **API & Domain Alignment** | `docs/API.md` | Added API contracts for `GET /cases/ageing`, `## 10. Tasks & Follow-ups` (`GET /tasks`, `POST /cases/{case_id}/tasks`, `PATCH /tasks/{id}`), `## 18. Data Imports` (`POST /imports/dry-run`, `POST /imports/execute`, `POST /imports/{batch_id}/revert`), and `## 19. Privacy & DSAR` (`POST /privacy/dsar`, `GET /privacy/dsar`, `PATCH /privacy/dsar/{id}`). |

---

## 2. Security Changes

1. **Upload Quarantine Zone**:
   - Browser presigned PUT URLs point strictly to `quarantine/{org_id}/{upload_id}/{sanitized_filename}`.
   - Files in quarantine are completely isolated and inaccessible via normal document download endpoints.
   - An asynchronous ARQ worker executes `validate_and_promote_document`: verifies MIME magic bytes, runs ClamAV malware scan, strips image EXIF metadata, and sanitizes filenames.
   - Clean files are copied to canonical private storage `{org_id}/documents/{document_id}/{version}/{filename}` and marked `received`.
   - Infected or malformed files are deleted/isolated, recorded with `scan_error`, and marked `scan_failed`.
   - Signed download URLs (`GET /documents/{id}/download`) assert that documents are promoted and verified; unvalidated/quarantined documents return 400/403.
   - Mandatory security test suite added (`SECURITY-TEST-008` and Phase 03 plan).

2. **Immediate Authorization Revocation (`auth_version`)**:
   - `users.auth_version INTEGER NOT NULL DEFAULT 1` added to schema.
   - Access token JWT payload embeds `auth_version`.
   - Server-side dependency verifies token `auth_version` against DB / cache (10s TTL).
   - Deactivating a user, downgrading their role, or triggering session revocation increments `users.auth_version` and invalidates refresh tokens, immediately blocking subsequent API calls without waiting for JWT expiry.
   - Added security tests to `SECURITY-TEST-005` and Phase 01 test ledger.

---

## 3. Scope Changes

1. **Preserved Reference Designs with Scope Alignment**:
   - Design assets in `Designs/` were kept intact to preserve visual aesthetics and layout patterns, but all visual implications of Release 2+ features were neutralized to in-scope equivalents.
   - Synthetic demo banners added to mockups to guarantee no confusion with real customer data.
2. **Explicit Scope Boundary Codified**:
   - Master Implementation Plan now includes `# RELEASE 1 IMPLEMENTATION BOUNDARY` prohibiting lender API gateways, automated credit scoring/decisioning, customer-facing loan offers, external cloud OCR, e-sign/e-mandate, EMI collection, accounting sync, native mobile apps, and WhatsApp bots.
   - Added binding rule in `AGENTS.md` preventing implementation agents from building features solely because they appear in design mockups.

---

## 4. Traceability Changes

Every SRS requirement now has an unambiguous destination and scope assignment in `docs/REQUIREMENTS_TRACEABILITY.md`:

| Requirement | Description | Scope Assignment | Phase | Rationale |
|---|---|---|---|---|
| **FR-OCR-001..003** | Local OCR suggested fields, human confirmation, mismatch flags | `PLANNED / POST-MVP` | Post-MVP | P2 priority in SRS; Release 1 focuses on core case lifecycle and secure upload quarantine. |
| **FR-OCR-004** | Data never leaves approved environment | `ARCHITECTURE CONSTRAINT` | PH-03, PH-10 | Mandatory security rule; zero external/cloud AI calls. |
| **IF-1** | Responsive UI >= 360px | `MVP / RELEASE 1` | PH-02+ | Mobile browser operation for field executives. |
| **IF-2** | Max 6 mandatory case fields | `MVP / RELEASE 1` | PH-02 | Rapid case creation under 3 minutes. |
| **IF-3** | Today view for stuck/due items | `MVP / RELEASE 1` | PH-08 | Operational daily control room. |
| **IF-4** | Hindi labels support | `PLANNED / POST-MVP` | PH-10 | English in MVP; Hindi dictionary in P1 hardening. |
| **IF-5** | INR currency with Indian grouping | `MVP / RELEASE 1` | PH-02+ | Standard financial display formatting. |
| **IF-6** | WCAG 2.1 AA accessibility | `MVP / RELEASE 1` | PH-10 | Contrast & keyboard operation audit. |
| **IF-7** | REST/JSON API with OpenAPI 3 | `MVP / RELEASE 1` | PH-00 | FastAPI native OpenAPI spec. |
| **IF-8** | CSV/Excel import/export column mapping | `MVP / RELEASE 1` | PH-07, PH-10 | Payout reconciliation statement import. |
| **IF-9** | Transactional email delivery | `MVP / RELEASE 1` | PH-09 | Password resets and alert notifications. |
| **IF-10** | WhatsApp API, vehicle data API, accounting export | `DEFERRED` | Post-MVP | External SaaS integrations deferred to Release 2; clean adapter interfaces defined. |
| **IF-11** | Mobile camera capture | `MVP / RELEASE 1` | PH-03 | Browser `<input type="file" capture="environment">`. |
| **IF-12** | TLS 1.2+ encryption | `ARCHITECTURE CONSTRAINT` | PH-00, PH-10 | Reverse proxy HTTPS cipher suite enforcement. |
| **NFR-USA-001** | Case created in <3 min | `MVP / RELEASE 1` | PH-02, PH-03 | Usability target for field executive workflow. |
| **NFR-USA-002** | Actionable error messages | `MVP / RELEASE 1` | PH-00, PH-01+ | Standardized `{code, message, action}` envelope. |
| **NFR-MNT-001** | Typed schemas, CI, migrations | `MVP / RELEASE 1` | PH-00 | Pydantic v2, Alembic, ruff, ESLint, GitHub Actions. |
| **NFR-MNT-002** | >=80% test coverage on core engines | `MVP / RELEASE 1` | PH-01..07, PH-10 | Mandatory pytest coverage gates. |
| **NFR-POR-001** | Containerized deployment | `MVP / RELEASE 1` | PH-00, PH-10 | Self-hosted Docker Compose architecture. |

---

## 5. API Changes

`docs/API.md` was expanded to provide full implementation contracts for previously planned domain capabilities:
1. **Case Ageing**: `GET /api/v1/cases/ageing` for stuck cases (>3 days) and SLA countdowns.
2. **Tasks & Follow-ups**: `GET /api/v1/tasks`, `POST /api/v1/cases/{case_id}/tasks`, `PATCH /api/v1/tasks/{id}` for field executive calls and document reminders.
3. **Data Imports**: `POST /api/v1/imports/dry-run`, `POST /api/v1/imports/execute`, `POST /api/v1/imports/{batch_id}/revert` (24-hour rollback per FR-IMP-003).
4. **Privacy / DSAR**: `POST /api/v1/privacy/dsar`, `GET /api/v1/privacy/dsar`, `PATCH /api/v1/privacy/dsar/{id}` for DPDP Act compliance.
5. **Document Quarantine**: `POST /documents/upload-url` (targets `quarantine/`), `POST /documents/confirm` (triggers ARQ worker), `GET /documents/{id}/status` (checks scan progress), and strict download URL verification.

---

## 6. Toolchain Decisions (ADR-006)

All core stack versions are pinned in `docs/decisions/ADR-006-toolchain-versions.md`:
- **Python**: `3.11.9`
- **Node.js**: `20.17.0 (LTS)`
- **FastAPI / Starlette / Uvicorn**: `0.115.x / 0.38.x / 0.30.x`
- **Pydantic**: `2.9.x`
- **SQLAlchemy / Asyncpg / Alembic**: `2.0.35+ / 0.29.x / 1.13.x`
- **Background Jobs**: `ARQ 0.26.x` over `redis:7.2-alpine`
- **Database**: `postgres:16-alpine`
- **Object Storage**: `minio/minio:RELEASE.2024-09-22T00-33-43Z`
- **Malware Scanning**: `clamav/clamav:1.3-alpine`
- **Frontend**: `React 18.3.1`, `TypeScript 5.5.x`, `Vite 5.4.x`, `TanStack Query 5.56.x`, `Zustand 4.5.x`
- **Testing**: `pytest 8.3.x`, `pytest-asyncio 0.24.x`, `pytest-cov 5.0.x`, `Vitest 2.1.x`, `Playwright 1.47.x`

---

## 7. Remaining Open Questions

As documented in `docs/OPEN_QUESTIONS.md`:
- **BQ-01 (Actual lender payout grids)** — Needed by PH-06; configurable rule engine handles any structure; demo data used until pilot DSA supplies grids.
- **BQ-02 (Per-lender checklist rules)** — Needed by PH-03; system ships with common vehicle-loan defaults; pilot DSA configures specific rules.
- **BQ-07 (GST & TDS mode for pilot DSA)** — Needed by PH-06; forward vs reverse charge and TDS rates are configurable.
- **BQ-09 (Lender statement column mapping)** — Needed by PH-07; configurable mapper allows saving templates per lender.
- **None of these questions block Phase 00 through Phase 03.**

---

## 8. Final Readiness Assessment

The architecture, security specifications, data models, API contracts, design system, and phase-by-phase implementation plans are now **100% aligned, mutually consistent, and free of scope ambiguity**.

All stop conditions have been met. No application code, database migrations, or frontend components have been created.

The project is fully prepared for Phase 00 (Foundation) implementation upon human approval.
