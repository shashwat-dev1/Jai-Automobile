# DSA OS — Automated and Manual E2E Test Plan

> **Version:** 1.0.0  
> **Target Release:** Production Demonstration Ready  
> **Conformance:** PRD v1.0, SRS v1.0, Appendix B (RBAC Matrix)

---

## 1. Test Strategy & Scope

The testing strategy validates that DSA OS operates reliably across three execution layers:
1. **Core Unit & Domain Logic:** Fast, deterministic testing of financial math, state machines, validation regexes, and security tokens.
2. **Integration & API Contract Tests:** Verifies FastAPI routers, database RLS, and error envelopes.
3. **End-to-End Responsive UI Flows:** Verifies cross-viewport UI rendering (320px–1440px), multi-tenant dynamic branding, human-in-the-loop OCR review, and complete case lifecycles.

---

## 2. Test Suites & Matrix

### Suite 1: Authentication & Authorization (AUTH-01 to AUTH-06)
- **AUTH-01:** Valid login with organization slug, email/mobile, and password. Access token issued and profile fetched.
- **AUTH-02:** Invalid login credentials rejected with standard HTTP 401 error envelope.
- **AUTH-03:** RS256 token rotation: active refresh token rotated, old token revoked.
- **AUTH-04:** Immediate session revocation: incrementing `auth_version` invalidates existing JWT access tokens immediately.
- **AUTH-05:** Account lockout: 5 consecutive failed attempts lock user account for 30 minutes.
- **AUTH-06:** Role-Based Access Control: verified permissions per SRS Appendix B for Owner, Manager, Processor, Field Executive, Accountant, and Auditor.

### Suite 2: Multi-Tenancy & White-Label Isolation (TENANT-01 to TENANT-04)
- **TENANT-01:** Dynamic branding: switching between demo organizations (Jai Automobiles vs Apex Capital Advisors) updates logo, name, tagline, and theme accent colors.
- **TENANT-02:** Database isolation: PostgreSQL RLS enforces that Org A cannot query or mutate cases, documents, or payouts of Org B.
- **TENANT-03:** Module configuration: disabling a module (e.g. Reconciliation or PDD) for a tenant disables route navigation and backend endpoints.
- **TENANT-04:** Audit context: all security and domain events capture the correct `org_id` and actor metadata.

### Suite 3: End-to-End Case Intake & Lifecycle (CASE-01 to CASE-06)
- **CASE-01:** Sourcing channel selection and referral attribution logging.
- **CASE-02:** Borrower KYC validation: Indian mobile format (+91 or 10-digit starting 6-9), PAN format (5 letters, 4 numbers, 1 letter), Aadhaar last 4.
- **CASE-03:** Collateral asset validation: Make, Model, Variant, and Registration Number (Indian RC regex).
- **CASE-04:** Document upload & quarantine: file size <= 10MB, acceptable MIME types (PDF, JPEG, PNG).
- **CASE-05:** Human-in-the-Loop OCR extraction: review modal displays confidence scores and allows field correction before case linkage.
- **CASE-06:** Sequential Case Number generation (e.g. `JA-2025-0101` or `APEX-2025-0101`) and case dossier loading.

### Suite 4: Finance, Commission & Reconciliation (FIN-01 to FIN-06)
- **FIN-01:** Commission rule evaluation: calculates gross payout expectation based on loan product (e.g., 2% on used car).
- **FIN-02:** PDD gating: holds payout expectation when lender policy requires RC endorsement or Form 34 completion.
- **FIN-03:** TDS withholding: deducts standard 5% TDS to determine net receivable amount.
- **FIN-04:** Sub-DSA splits: validates that total split percentages do not exceed 100% of gross expectation (BR-09).
- **FIN-05:** Statement CSV reconciliation: simulates dry-run and commits import with exact UTR and fuzzy tolerance matching.
- **FIN-06:** Receivables ledger & aging report: groups unpaid expectations into 0-30, 31-60, 61-90, and 90+ day buckets.

### Suite 5: Responsive UI & Viewport Validation (UI-01 to UI-08)
- **UI-01 (320px):** Ultra-narrow mobile: zero horizontal overflow, drawer navigation accessible, forms reflow into single column.
- **UI-02 (360px):** Standard Android view: cards adapt cleanly, status chips wrap without clipping.
- **UI-03 (375px):** iPhone SE view: primary buttons reach tap targets >= 44px, drawer closes upon route click.
- **UI-04 (390px):** iPhone 14/15 view: dossier tabs and financial KPI grids display without overlapping.
- **UI-05 (430px):** iPhone Pro Max / Plus view: tables utilize horizontal touch scrolling with sticky headers.
- **UI-06 (768px):** Tablet view: 2-column dossier layout renders cleanly.
- **UI-07 (1024px):** Small desktop / iPad landscape: sidebar expands with full labels and user account footer.
- **UI-08 (1440px):** Wide desktop: full financial tables, KPI strips, and analytics velocity charts display in high density.
