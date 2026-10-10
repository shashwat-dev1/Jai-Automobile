# DSA OS — Actual Test Execution Results

> **Test Date:** October 10, 2026  
> **Backend Test Framework:** pytest 8.3.3 / Python 3.11.9  
> **Frontend Test Framework:** Vitest 2.1.1 / React 18  
> **Total Automated Tests Executed:** 227 (159 backend + 68 frontend)  
> **Pass Rate:** 100.0% (0 failures, 0 regressions)

---

## 1. Summary of Execution

```
================================================================================
LAYER                   TEST SUITES      TESTS PASSED      TESTS FAILED     PASS RATE
================================================================================
Backend (FastAPI)       18               159               0                100.0%
Frontend (Vitest)       11               68                0                100.0%
--------------------------------------------------------------------------------
TOTAL                   29               227               0                100.0%
================================================================================
```

---

## 2. Backend Suite Breakdown (159 / 159 Passed)

- `tests/test_referrals.py` (7 tests) — **PASS** (Mobile normalization `+91 98765 43210` -> `9876543210`, invalid phone validation, masked mobile PII protection `98****3210`, guest submission schema, bulk assign schema, call activity schema, commission lifecycle status updates)
- `tests/test_cases.py` (6 tests) — **PASS** (Case intake validation, vehicle RC regex, optimistic locking, duplicate detection, state machine transitions)
- `tests/test_auth.py` (9 tests) — **PASS** (Argon2id hashing, RS256 token roundtrip, token expiry, tampered token rejection, account lockout, session revocation via auth_version, login/refresh/logout/me endpoints)
- `tests/test_documents.py` (10 tests) — **PASS** (Quarantine upload, validation pipeline, virus scan simulation, download presigned URL, status transition, checklist generation)
- `tests/test_foundation.py` (21 tests) — **PASS** (Config resolution, database engine warmup, CORS headers, RequestID middleware, security headers)
- `tests/test_hardening.py` (10 tests) — **PASS** (Rate limiting, SQL injection defense, XSS sanitation, sensitive field masking)
- `tests/test_health.py` (14 tests) — **PASS** (Liveness, readiness, DB ping, Redis status, storage health)
- `tests/test_lenders.py` (7 tests) — **PASS** (Lender CRUD, multi-lender applications, sanction terms, disbursal, winning offer selection)
- `tests/test_notifications.py` (11 tests) — **PASS** (In-app notifications, event listener dispatch, read receipt toggles, mock query count refinement)
- `tests/test_parties.py` (5 tests) — **PASS** (Customer creation, PII encryption at rest, audited PAN reveal, optimistic locking)
- `tests/test_payout.py` (9 tests) — **PASS** (Commission rule grid, auto expectation calculation on disbursal, no-rule invariant, PDD gating hold/release, manual override, sub-DSA splits)
- `tests/test_pdd.py` (5 tests) — **PASS** (Auto-creation of PDD items on disbursal, status lifecycle timestamps, rejection reason mandatory)
- `tests/test_rbac.py` (7 tests) — **PASS** (Owner vs Manager vs Processor vs Accountant vs Field vs Auditor vs Telecaller permissions)
- `tests/test_reconciliation.py` (17 tests) — **PASS** (Statement dry-run, commit import, auto UTR match, 24h batch reversal, manual match, clawback event creation)
- `tests/test_reports.py` (8 tests) — **PASS** (Dashboard overview, today cockpit, source analytics, CSV exports)
- `tests/test_sources.py` (1 test) — **PASS** (Lead source creation, empanelment listing)
- `tests/test_tenancy.py` (2 tests) — **PASS** (Dynamic organization branding update, platform tenant listing & module entitlements)
- `tests/test_tenant_isolation.py` (3 tests) — **PASS** (PostgreSQL RLS enforcement across Org A and Org B)
- `tests/test_workflow.py` (5 tests) — **PASS** (Document gating manager override, follow-up task CRUD, overdue filtering, SLA indicator computation)

---

## 3. Frontend Suite Breakdown (68 / 68 Passed)

- `src/test/phase1_referrals_telecaller.test.tsx` (9 tests) — **PASS**:
  - Telecaller KPI counters rendering
  - Active session desk banner
  - Customer search filter
  - Guest referral Step 1 mobile validation (requires 10 digits to continue)
  - Guest referral Step 2 intake form prefill for returning partners
  - PIN code auto city/state resolver (PIN `302001` -> Jaipur, Rajasthan)
  - Referral partners KPI metrics strip
  - Masked mobile number display (`98****4551`) in general listings
  - Slide-over partner dossier drawer toggle
  - Lead bulk Excel/CSV dropzone and template download
- `src/test/cases.test.tsx` (5 tests) — **PASS** (Case list table, search, filters, optimistic locking)
- `src/test/documents.test.tsx` (2 tests) — **PASS** (Quarantine upload simulation, document preview)
- `src/test/auth.test.ts` (5 tests) — **PASS** (Auth token storage, role resolution, permission guard)
- `src/test/Button.test.tsx` (13 tests) — **PASS** (Visual variants, disabled states, hover indicators)
- `src/test/dashboard_reports.test.tsx` (8 tests) — **PASS** (KPI cards, volume summaries, conversion charts)
- `src/test/lenders_workflow.test.tsx` (5 tests) — **PASS** (Lender offers, selection, sanction terms)
- `src/test/notifications.test.tsx` (5 tests) — **PASS** (Notification tray, mark read, toast triggers)
- `src/test/payout.test.tsx` (5 tests) — **PASS** (Split percentage calculation, BR-09 split validation)
- `src/test/pdd.test.tsx` (5 tests) — **PASS** (PDD tracking, RC hypothecation items)
- `src/test/reconciliation.test.tsx` (6 tests) — **PASS** (Statement wizard, auto UTR mapping)

---

## 4. End-to-End Browser Subagent Verification

Live browser interactive verification was executed against the running Vite application server:

1. **Public Referral Portal (`/referral`):**
   - Verified white-label branding header ("Jai Automobiles").
   - Tested mobile `9820044551` lookup. Recognized returning partner *"Welcome Back, Vikram Sharma!"*.
   - Auto-resolved PIN code `400053` to Mumbai, Maharashtra.
2. **Telecaller Workspace (`/telecaller`):**
   - Verified KPI counters (*Assigned Leads*, *Pending First Call*, *Follow-ups Due*, *Interested Leads*).
   - Clicked *"📝 Log Call Activity"* on assigned lead. Verified call drawer opened with click-to-call link, outcome choices, remarks, and activity history.
3. **Referral Partners Dashboard (`/referrals`):**
   - Verified partner directory table.
   - Confirmed mobile numbers are masked (`98****4551`) protecting privacy.
   - Opened partner dossier drawer showing associated leads and commission records.
4. **Cold Leads & Files (`/cases`):**
   - Verified *"📥 Bulk Excel Import"* button, selection checkboxes, and telecaller assignment action bar.
