# DSA OS — Automated and Manual E2E Test Plan

> **Version:** 2.0.0  
> **Target Release:** Critical Bug Fixes, Document Rules & RBAC Release  
> **Conformance:** PRD v1.0, SRS v1.0, Appendix B (RBAC Matrix)

---

## 1. Test Strategy & Scope

The testing strategy validates that DSA OS operates reliably across four execution layers:
1. **Core Unit & Domain Logic:** Fast, deterministic testing of financial math, state machines, validation regexes, and security tokens (Pytest + Vitest).
2. **Integration & API Contract Tests:** Verifies FastAPI routers, database RLS, and error envelopes.
3. **End-to-End Headless Browser Automation:** Real browser testing in Chromium via Playwright verifying DOM state, validation errors, and network assertions.
4. **Responsive UI & Mobile Usability:** Verifies cross-viewport UI rendering (320px–1440px), form reflow, touch targets, and absence of horizontal overflow.

---

## 2. Test Suites & Matrix

### Suite 1: Authentication & Authorization (AUTH-01 to AUTH-06)
- **AUTH-01:** Valid login with organization slug, email/mobile, and password. Access token issued and profile fetched.
- **AUTH-02:** Invalid login credentials rejected with standard HTTP 401 error envelope.
- **AUTH-03:** Token rotation: active refresh token rotated, old token revoked.
- **AUTH-04:** Immediate session revocation: incrementing `auth_version` invalidates existing JWT access tokens immediately.
- **AUTH-05:** Account lockout: 5 consecutive failed attempts lock user account for 30 minutes.
- **AUTH-06:** Role-Based Access Control: verified permissions per SRS Appendix B for Owner, Telecaller, Processor, and Guest.

### Suite 2: Multi-Tenancy & White-Label Isolation (TENANT-01 to TENANT-04)
- **TENANT-01:** Dynamic branding: switching organizations updates logo, name, tagline, and theme accent colors.
- **TENANT-02:** Database isolation: PostgreSQL RLS enforces that Org A cannot query or mutate cases, documents, or payouts of Org B.
- **TENANT-03:** Module configuration: disabling a module for a tenant disables route navigation and backend endpoints.
- **TENANT-04:** Audit context: all security and domain events capture the correct `org_id` and actor metadata.

### Suite 3: Referral Intake & Document Rules (REF-01 to REF-03)
- **Test A (New Referral Partner):**
  1. Open public referral intake (`/referral`).
  2. Enter unregistered mobile number.
  3. Verify partner name input appears.
  4. Select Brand New Vehicle.
  5. Attempt submission without Aadhaar: blocked with "Aadhaar card is mandatory for every lead submission".
  6. Attach Aadhaar, attempt submission without PAN: blocked with "PAN card is mandatory for every lead submission".
  7. Attach PAN, leave RC copy empty (optional for new vehicles).
  8. Submit: verify successful creation of lead, referral attribution, and success card.
- **Test B (Used Vehicle & RC Rule):**
  1. Open referral intake, select Used / Pre-Owned Vehicle.
  2. Verify RC badge dynamically indicates `* Mandatory (Used)`.
  3. Attach Aadhaar and PAN, omit RC.
  4. Submit: blocked with "RC document is mandatory for used/old vehicle loan applications".
  5. Attach RC, submit: verify successful lead creation.
- **Test C (Returning Referral Partner):**
  1. Enter mobile of existing partner (`9820044551`).
  2. Verify system identifies registered partner ("Vikram Sharma") and hides name input.
  3. Submit second lead: verify lead is attributed to existing partner without duplicate profile creation.

### Suite 4: Telecaller Role-Based Isolation & Dashboards (TC-01 to TC-03)
- **Test D (Telecaller A vs Telecaller B Isolation):**
  1. Seed 6 isolated leads: Telecaller A (4 leads: `case-jai-101` to `104`), Telecaller B (2 leads: `case-jai-105` to `106`).
  2. Log in as Telecaller A (`priya.sharma@jaiautomobiles.com`).
  3. Verify Telecaller Dashboard displays KPI `Assigned Leads: 4` and table has exactly 4 leads.
  4. Log call outcome and remark on assigned lead: verify persistence.
  5. Attempt direct navigation to Telecaller B's lead `/cases/case-jai-105`: verify page displays `Access Denied (403 Forbidden)`.
  6. Attempt direct API request: verify HTTP 403 Forbidden.
  7. Log in as Telecaller B (`rahul.verma@jaiautomobiles.com`).
  8. Verify Telecaller Dashboard displays KPI `Assigned Leads: 2` and table has exactly 2 leads.
  9. Attempt direct navigation to Telecaller A's lead `/cases/case-jai-101`: verify `Access Denied (403 Forbidden)`.

### Suite 5: Administrator Full Visibility & Regression (ADM-01 to ADM-04)
- **Test E (Admin Regression):**
  1. Log in as DSA Administrator (`admin@jaiautomobiles.com`).
  2. Navigate to `/cases`: verify all 6 leads are visible.
  3. Select lead checkbox: verify bulk assignment action bar appears.
  4. Reassign lead to another telecaller: verify assignment updates.
  5. Navigate to `/referrals/partners`: verify referral partner analytics and ledger are accessible.

### Suite 6: Responsive UI & Viewport Validation (UI-01 to UI-06)
- **Test F (Cross-Device Viewports):**
  - Viewports:
    - `320px × 568px` (iPhone SE)
    - `360px × 640px` (Android Small)
    - `375px × 667px` (iPhone 8)
    - `390px × 844px` (iPhone 13/14)
    - `430px × 932px` (iPhone Pro Max)
    - `1280px × 800px` (Desktop HD)
  - Assertions:
    - Zero horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`)
    - Touch targets >= 44px
    - Form fields stack into single column on viewports <= 640px
    - Evidence screenshots captured for visual regression review
