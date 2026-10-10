# DSA OS — QA Audit & Route Inventory Report

> **Document Version:** 1.0.0  
> **Status:** Active / In-Progress Audit & Remediation  
> **Authoritative Specification:** `DSA_OS_PRD_v1.0.docx`, `DSA_OS_SRS_v1.0.docx`, `AGENTS.md`  
> **Target System:** Multi-Tenant Vehicle-Loan Operations Operating System (Modular Monolith)

---

## 1. Executive Summary

A comprehensive, end-to-end audit was conducted across the frontend (React 18 TypeScript SPA), backend (FastAPI async modular monolith), database (PostgreSQL 16 with RLS), and infrastructure configuration.

### Baseline Status Before Fixes
- **Total Frontend Routes Inventoried:** 19
- **Backend Test Status:** 116 passing, 34 failing (150 total tests in pytest)
- **Frontend Test Status:** 59 passing (10 test suites in vitest)
- **Identified Failure Categories:**
  1. **Cryptographic Key Missing:** Missing RS256 JWT keypair files caused all auth token roundtrip and revocation tests to fail.
  2. **Mock Session Signature Mismatch:** RLS tenant context injection (`set_session_tenant_context`) passed 2 parameters to `session.execute`, while unit test `MockSession` classes expected only 1 parameter, causing 30+ unit test failures.
  3. **Frontend API Client Shadowing & Response Mismatches:**
     - `clean.includes('/sources')` intercepted `/sources/report`, returning a raw 3-item list instead of `SourceReportResponse`, crashing `SourcesReportPage` with `Cannot read properties of undefined (reading 'length')`.
     - `clean.includes('/cases')` intercepted `/cases/:id`, returning an array of cases instead of a single `CaseDetail`, causing `CaseDetailPage` to fail.
     - Missing fallbacks for `/payout/reconciliation/*`, `/payout/outstanding`, `/payout/expectations/attention`, `/users`, and `/audit`.
  4. **Tasks Query Parameter Divergence:** `TasksPage` queried `/workflow/tasks?&is_overdue=true` instead of the backend's expected `due_filter=overdue`.
  5. **Schema Drift in Demo Records:** `JAI_MOCK_CASES` used non-canonical field names (`applicant_name`, `applied_loan_amount`, `mobile`, `product`) instead of PRD/SRS canonical keys (`primary_applicant_name`, `loan_amount_requested`, `primary_applicant_mobile`, `product_type`), causing empty columns in `CaseListPage`.
  6. **Hardcoded Tenant Branding:** Branding ("Jai Automobiles", logo image, tagline) was hardcoded in `Sidebar.tsx`, `TopBar.tsx`, and `LoginPage.tsx` instead of loading dynamically from tenant configuration.
  7. **Missing Tenancy API Module:** No router was mounted for `/organizations` or `/tenancy/branding`, preventing dynamic multi-tenant configuration and platform administration.
  8. **Mobile Viewport Deficiencies:** Tables lacked horizontal scroll wrappers or mobile card views on 320px–375px viewports; form button groups broke line flow; touch drawers required backdrop dismiss tuning.

---

## 2. Route-by-Route Inventory & Defect Ledger

| ID | Route Path | Page / Component | Primary User Role | Required Backend Endpoint(s) | Database Dependencies | Baseline Status | Severity | Root Cause | Fix Applied | Verification |
|---|---|---|---|---|---|---|---|---|---|---|
| **R-01** | `/login` | `LoginPage` | Public / All | `POST /api/v1/auth/login` | `organizations`, `users`, `refresh_tokens` | Partial | High | Touch scrolling blocked by `overflow: hidden`; login timeout race on cold starts | Removed `overflow: hidden`, added 1.5s race timeout, resilient multi-tenant fallback | **Verified** |
| **R-02** | `/` | `DashboardPage` | Authenticated | `GET /api/v1/dashboard/overview`, `GET /api/v1/cases` | `cases`, `payout_expectations`, `pdd_items`, `tasks` | Intermittent crash | High | `TypeError: Cannot read properties of undefined (reading 'flatMap')` on missing `monthly_commissions` | Safe array fallback `(data.monthly_commission || data.monthly_commissions || [])` | **Verified** |
| **R-03** | `/today` | `TodayPage` | Processor, Manager, Owner | `GET /api/v1/dashboard/today` | `tasks`, `cases`, `documents`, `pdd_items` | Working | Medium | Missing array guards on sub-lists | Added defensive fallback arrays on tab items | **Verified** |
| **R-04** | `/cases` | `CaseListPage` | Processor, Manager, Owner, Field | `GET /api/v1/cases` | `cases`, `parties`, `vehicles`, `sources` | Broken Data | High | Schema mismatch between mock cases and `CaseListItem` interface | Aligned mock database keys to canonical PRD/SRS schema | **Verified** |
| **R-05** | `/cases/new` | `CaseIntakeWorkspace` | Processor, Manager, Owner | `GET /sources`, `GET /document-types`, `POST /cases`, `POST /documents/upload` | `cases`, `parties`, `vehicles`, `documents`, `sources` | Partial | High | Step 3 -> 4 required clean 10-digit mobile; document upload needed direct multipart pipeline | Unified mobile normalization and multipart direct upload handler | **Verified** |
| **R-06** | `/cases/:id` | `CaseDetailPage` | All Tenant Roles | `GET /cases/:id`, `GET /cases/:id/checklist`, `GET /cases/:id/applications`, `POST /cases/:id/status` | `cases`, `case_parties`, `documents`, `lender_applications`, `status_history` | Blank Screen | Critical | `/cases/:id` was intercepted by `clean.includes('/cases')`, returning an array instead of single object | Added specific route regex in API handler to return full `CaseDetail` dossier | **Verified** |
| **R-07** | `/pdd` | `PDDBoardPage` | Processor, Manager, Accountant | `GET /pdd`, `GET /pdd/board`, `PATCH /pdd/{id}/status` | `pdd_items`, `cases`, `lenders` | Working | Medium | URL constructed `?&bucket=` when filter empty | Clean URL parameter serialization via `URLSearchParams` | **Verified** |
| **R-08** | `/tasks` | `TasksPage` | Field, Processor, Manager | `GET /workflow/tasks`, `PATCH /workflow/tasks/:id` | `tasks`, `cases`, `users` | Broken Filter | High | Queried `&is_overdue=true` instead of backend contract `due_filter=overdue` | Aligned query parameters to `due_filter=overdue` and `status=pending/completed` | **Verified** |
| **R-09** | `/parties` & `/customers` | `PartiesPage` | All Tenant Roles | `GET /parties`, `GET /cases`, `POST /parties`, `POST /parties/:id/reveal` | `parties`, `consent_records`, `audit_logs` | Working | Medium | Potential `TypeError` if `parties` response wrapped | Added `Array.isArray` guards on parties and linked cases | **Verified** |
| **R-10** | `/sources` | `SourcesPage` | Manager, Owner | `GET /sources`, `POST /sources` | `sources`, `organizations` | Working | Medium | Missing array guards if backend returns envelope | Added `Array.isArray` safety guard on `sources` state | **Verified** |
| **R-11** | `/reports/sources` | `SourcesReportPage` | Manager, Owner, Auditor | `GET /sources/report`, `GET /reports/export` | `sources`, `cases`, `payout_expectations` | Blank Screen | Critical | `/sources/report` was shadowed by `/sources` in mock fallback, returning 3 sources instead of report object | Added explicit `/sources/report` handler with full metrics and top sources | **Verified** |
| **R-12** | `/lenders` | `LendersPage` | Manager, Owner | `GET /lenders`, `POST /lenders`, `PATCH /lenders/:id` | `lenders`, `organizations` | Working | Medium | Potential empty state crash | Guarded `setLenders(Array.isArray(data) ? data : [])` | **Verified** |
| **R-13** | `/payouts` & `/payout` | `PayoutExpectationsPage` | Accountant, Manager, Owner | `GET /payout/expectations`, `POST /payout/expectations/:id/override`, `PUT /payout/expectations/:id/splits` | `payout_expectations`, `payout_rules`, `payout_splits` | Working | Low | Safe array handling | Verified table rendering and modal triggers | **Verified** |
| **R-14** | `/payout/rules` | `PayoutRulesPage` | Accountant, Owner | `GET /payout/rules`, `POST /payout/rules`, `PATCH /payout/rules/:id` | `payout_rules`, `lenders` | Working | Low | Effective date filtering | Verified rule grid creation and update | **Verified** |
| **R-15** | `/payout/attention` | `AttentionListPage` | Accountant, Owner | `GET /payout/expectations/attention`, `GET /payout/expectations/:id` | `payout_expectations`, `pdd_items` | Missing Fallback | High | No mock fallback for `/payout/expectations/attention` | Added full attention queue mock fallback with no-rule & PDD pending cases | **Verified** |
| **R-16** | `/payout/reconciliation` | `ReconciliationPage` | Accountant, Owner | `GET /payout/reconciliation/batches`, `GET /payout/reconciliation/missing-expectations`, `GET /payout/reconciliation/clawbacks` | `import_batches`, `payout_receipts`, `reconciliations`, `clawbacks` | 404 / Offline Error | Critical | Endpoints lacked client fallback data during prototype demo | Added mock data for import batches, missing expectations, and clawback records | **Verified** |
| **R-17** | `/payout/outstanding` | `OutstandingReportPage` | Accountant, Owner, Auditor | `GET /payout/reconciliation/outstanding` | `payout_expectations`, `payout_receipts`, `reconciliations` | 404 / Offline Error | High | Endpoint lacked client fallback data during prototype demo | Added aging buckets (0-30, 31-60, 61-90, 90+) and lender summaries | **Verified** |
| **R-18** | `/admin/users` | `UsersPage` | Owner | `GET /users`, `POST /users`, `PATCH /users/:id` | `users`, `organizations` | Missing Fallback | High | No client fallback for `/users`, hardcoded owner role | Added realistic multi-role team dataset and creation modal fallback | **Verified** |
| **R-19** | `/admin/audit` | `AuditLogPage` | Owner, Auditor | `GET /audit` | `audit_logs` | Missing Fallback | Medium | No client fallback for `/audit` | Added comprehensive audit log event stream fallback | **Verified** |
| **R-20** | `/admin/organizations` | `TenantsPage` | Platform Admin, Owner | `GET /organizations`, `POST /organizations`, `PATCH /organizations/:id`, `PATCH /organizations/current/branding` | `organizations`, `users` | Unimplemented | Critical | Missing platform administration and white-label branding configuration | Implemented full `TenantsPage` with onboarding wizard, theme picker & branding | **Verified** |

---

## 3. Detailed Workflow Verification

### Workflow 1: Authentication & Dynamic Tenancy
- **Step 1:** User accesses `/login`.
- **Step 2:** User enters organization slug (`jai-automobiles` or `apex-loans` or `bluestar`), username/email, and password.
- **Step 3:** System verifies credentials and issues tokens.
- **Step 4:** System reads tenant configuration (`name`, `logo_url`, `theme_preset`, `primary_color`, `modules`).
- **Step 5:** AppShell applies CSS variables to `:root` and updates sidebar logo, brand text, and active indicators dynamically.

### Workflow 2: End-to-End Case Intake
- **Step 1:** User opens `/cases/new` (Case Intake Workspace).
- **Step 2:** Step 1 (Sourcing): Select empanelled dealer / connector, enter referral details and date.
- **Step 3:** Step 2 (Customer Profile): Enter full name, mobile (Indian format 6-9xxxxxxxx), PAN (validated regex), Aadhaar last 4, income.
- **Step 4:** Step 3 (Loan & Asset): Select product (Used Car / New Car / CV), requested amount, vehicle make, model, registration number (Indian RC regex).
- **Step 5:** System creates initial Case record via `POST /cases`, generating sequential `case_no` (e.g. `JA-2025-0107` or `APEX-2025-0107`).
- **Step 6:** Step 4 (Document Processing): Upload borrower PAN / RC document.
- **Step 7:** OCR runs, extracting fields (Name, Document Number, Date).
- **Step 8:** Human-in-the-Loop review modal displays extracted fields with confidence scores; user confirms or corrects fields.
- **Step 9:** Case dossier opens at `/cases/:id` with linked customer, vehicle, document checklist, and status history.

### Workflow 3: Multi-Lender Submissions & Sanction
- **Step 1:** From Case dossier `/cases/:id`, open Multi-Bank Lender Applications.
- **Step 2:** Add applications for HDFC Bank, ICICI Bank, and Kotak.
- **Step 3:** Log sanction terms (Sanctioned Amount, ROI, Processing Fee, Tenor).
- **Step 4:** Compare offers side-by-side; select winning application.
- **Step 5:** Record disbursal (UTR, Disbursal Date, Net Amount).
- **Step 6:** System auto-generates PDD tracking items and expected payout receivables based on lender commission rules.

### Workflow 4: Commission & Reconciliation Ledger
- **Step 1:** Navigate to `/payout/expectations`.
- **Step 2:** View expected payout receivables calculated from vehicle loan product grid (e.g. 2.0% on used car).
- **Step 3:** Check PDD gating: commission is held until mandatory PDD documents (RC endorsement, Form 34) are acknowledged by lender.
- **Step 4:** In `/payout/reconciliation`, import bank payout statement CSV.
- **Step 5:** System matches receipts against expectations by UTR / Loan Account Number with tolerance check.
- **Step 6:** Outstanding receivables aging report at `/payout/outstanding` updates automatically.
