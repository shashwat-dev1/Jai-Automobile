# Phase 0: Discovery Report — Lead-to-Partner Allocation Workflow & Sidebar Simplification
**Platform:** Jai Automobiles DSA OS  
**Date:** 2026-10-21  
**Author:** Full-Stack Engineering (Antigravity Agent)  
**Scope:** Incremental feature update (no rewrite, no destructive migrations, zero fabricated production data)

---

## 1. Architectural Foundation & Firestore Access Model

### 1.1 Technology Stack & Runtime Architecture
- **Frontend Framework:** React 18.3.1 with TypeScript 5.5.4, Vite 5.4.8 bundler (`frontend/package.json`).
- **Routing:** React Router DOM v6.26.2 (`frontend/src/app/routes.tsx`) configured with `BrowserRouter`, declarative protected route guards (`ProtectedRoute.tsx`), and layout nesting in `AppShell.tsx`.
- **State Management & Data Layer:**
  - **Zustand 4.5.5:** Manages session authentication (`useAuthStore` in `src/features/auth/useAuth.ts`) and multi-tenant contextual state (`useTenantStore` in `src/features/auth/useTenant.ts`).
  - **TanStack React Query 5.56.2:** Query caching and background invalidation infrastructure.
  - **Local Persistence & Bi-directional Cloud Sync (`src/shared/lib/storeSync.ts`):** 
    Uses localStorage keys (`STORAGE_KEYS.CASES`, `STORAGE_KEYS.DOCUMENTS`, `STORAGE_KEYS.REFERRAL_PROFILES`, `STORAGE_KEYS.PARTIES`) as an offline-resilient local cache.
    When Firebase credentials are present, attaches real-time Firestore listeners (`onSnapshot` on `cases`, `referral_profiles`, `parties`) and synchronizes local modifications via `syncCaseToCloud` and `mergeRemoteCases`. Dispatches window events (`dsa_os_cases_updated`, `dsa_os_referrals_updated`, `dsa_os_parties_updated`, `dsa_os_documents_updated`) to trigger instant reactive re-renders across browser tabs.
  - **HTTP/Mock Client Layer (`src/shared/lib/api.ts`):**
    Provides unified `api.get`, `api.post`, `api.put`, `api.patch`, `api.delete` methods. For client routes targeting `/api/v1`, requests are handled with resilient fallback handlers backed by `storeSync.ts` and Firestore.

### 1.2 Firestore Access Pattern (Client SDK vs Functions)
- **Direct Client SDK:** Access to Firestore is executed client-side via Firebase JS SDK v13.0.0 (`firebase/firestore`, `firebase/auth`, `firebase/storage`) configured in `frontend/src/shared/lib/firebase.ts` and `frontend/src/shared/lib/firebaseService.ts`.
- **Zero Cloud Functions Deployed:** The deployment is hosted on Vercel as a single-page application (`vercel.json`) with client-side routing rewrites (`/(.*) -> /index.html`). There are no Cloud Functions in the repository.
- **Security Implications:** Because reads and writes are initiated from the client SDK, **Firestore Security Rules (`firestore.rules`)** serve as the strict server-side authorization enforcement boundary. Security and isolation cannot depend on UI rendering checks alone.

---

## 2. Existing Collections & Data Model Inventory

| Collection / Entity | Storage Mechanism | Key Fields & Types | Status & Constraints |
|---|---|---|---|
| **Leads (`cases`)** | Firestore collection `cases` + `STORAGE_KEYS.CASES` | `id` (string), `case_no` (string, e.g. `JA-2025-0101`), `status` (CaseStatus), `product_type` (`new_car` \| `used_car` \| `commercial_vehicle` \| `two_wheeler` \| `refinance` \| `top_up` \| `balance_transfer`), `loan_amount_requested` (number), `loan_amount_sanctioned` (number \| null), `loan_amount_disbursed` (number \| null), `primary_applicant_name` (string), `primary_applicant_mobile` (string), `source_type` (`direct` \| `referral` \| `dealer` \| `connector`), `source_name` (string), `referral_profile_id` (string \| null), `referral_partner_name` (string \| null), `referral_partner_mobile` (string \| null), `assigned_telecaller_id` (string \| null), `assigned_telecaller_name` (string \| null), `call_outcome` (string \| null), `telecaller_remarks` (string \| null), `follow_up_at` (ISO string \| null), `call_attempts_count` (number), `status_history` (array), `call_activity_history` (array), `documents` (array), `organization_slug` (string), `version` (number), `created_at` (ISO string), `updated_at` (ISO string). | Exists. Active primary entity. Needs minimal denormalized fields: `current_stage`, `allocation_count`. |
| **Customers (`parties`)** | Firestore collection `parties` + `STORAGE_KEYS.PARTIES` | `id` (string, e.g. `p1`), `org_id` (UUID), `name` (string), `mobile_primary` (string), `pan_last_four` (string \| null), `pan_masked` (string \| null), `aadhaar_masked` (string \| null), `employment_type` (string \| null), `city` (string \| null), `state` (string \| null), `monthly_income` (number \| null), `version` (number), `created_at` (ISO string). | Exists. Preserves customer identity across multiple loan cases. Reconciled via `syncCustomerFromCase`. |
| **Referral Partners (`referral_profiles`)** | Firestore collection `referral_profiles` + `STORAGE_KEYS.REFERRAL_PROFILES` | `id` (string, e.g. `ref-1`), `name` (string), `mobile_primary` (string), `masked_mobile` (string), `role` (`connector` \| `broker` \| `dealer` \| `direct`), `verification_status` (`verified` \| `pending_verification`), `total_leads` (number), `interested_leads` (number), `converted_leads` (number), `disbursed_leads` (number), `bank_account_last_four` (string), `upi_id` (string), `created_at` (ISO string). | Exists. **Lead introducers only.** Completely isolated from financing partners/lenders. |
| **Users & Roles (`users`)** | Firestore collection `users` + `JAI_MOCK_USERS` | `uid` / `id` (string), `email` (string), `name` (string), `role` (`owner` \| `manager` \| `processor` \| `accountant` \| `field_executive` \| `auditor` \| `telecaller`), `organization_slug` (string), `is_active` (boolean), `permissions` (string[]), `created_at` (Timestamp / ISO string). | Exists. Enforced in `usePermission`, `ProtectedRoute`, and `api.ts`. |
| **Activities & Audit** | Embedded arrays on `cases` + `JAI_MOCK_AUDIT` (`/admin/audit`) | **Case level:** `status_history` (`id, from_status, to_status, reason, changed_by, changer_name, created_at`) and `call_activity_history` (`id, outcome, remarks, follow_up_at, telecaller_name, created_at`).<br>**System level:** `audit_events` (`id, timestamp, actor_id, actor_name, actor_role, action, resource_type, resource_id, changes`). | Exists. Must record allocation, status changes, sanctions, rejections, policy updates, and payout receipts. |
| **Follow-ups** | Embedded on `cases` (`follow_up_at`) + `todayDataService.ts` | `follow_up_at` (ISO string), `call_outcome === 'follow_up'`, `telecaller_remarks`, `call_activity_history` entries. | Exists. Currently lacks single centralized queue selector with strict IST day boundary calculations. |
| **Documents** | Firestore `case_documents` + `STORAGE_KEYS.DOCUMENTS` | `id` (string), `case_id` (string), `document_type_id` (`dt-pan`, `dt-aadhaar`, `dt-rc`), `file_name` (string), `file_size` (number), `mime_type` (string), `status` (`received` \| `verified` \| `rejected` \| `quarantined`), `can_download` (boolean), `download_url` (string), `scan_result` (OCR payload). | Exists. Zero-mock OCR extraction pipeline. Private document storage behind authentication. |
| **Financing Partners (`financingPartners`)** | Currently unstructured mock in `LendersPage.tsx` | Proposed additive collection: `id` (stable slug e.g. `hdfc-bank`), `name` (string), `type` (`bank` \| `nbfc`), `active` (boolean), `created_at`, `created_by`. | **MISSING.** Must be created as a dedicated master collection. Must NOT share collection or IDs with `referral_profiles`. |
| **Partner Allocations (`partnerAllocations`)** | None | Proposed additive collection: `id` (`${leadId}_${financingPartnerId}`), `leadId` (string), `financingPartnerId` (string), `status` (`Allocated` \| `In Process` \| `Sanctioned` \| `Rejected`), `allocatedBy` (string), `allocatedAt` (Timestamp/ISO), `statusUpdatedBy` (string), `statusUpdatedAt` (Timestamp/ISO), `requestedAmountSnapshot` (number), `sanctionAmount` (number \| null), `sanctionedAt` (Timestamp/ISO \| null), `rejectedAt` (Timestamp/ISO \| null), `rejectionReason` (string \| null), `history` (array), `reportingMonth` (`YYYY-MM` derived from `sanctionedAt` in IST). | **MISSING.** Must be created with deterministic ID for idempotent multi-lender distribution. |
| **Payout Policies (`payoutPolicies`)** | None (only mock expectations in `PayoutExpectationsPage.tsx`) | Proposed additive collection: `id`, `financingPartnerId`, `effectiveFrom`, `effectiveTo` (nullable), `period` (`monthly`), `calculationBasis` (`sanctioned_amount` \| `disbursed_amount`), `tierMode` (`slab` \| `cliff`), `tiers` (`[{ minAmount, maxAmount, ratePercent }]`), `createdBy`, `createdAt`. | **MISSING.** Must be versioned with no overlapping ranges. |
| **Payout Receipts (`payoutReceipts`)** | None | Proposed additive collection: `id`, `financingPartnerId`, `period` (`YYYY-MM`), `amount` (integer paise/number), `receivedOn` (date string), `reference` (UTR/bank ref), `recordedBy`, `recordedAt`. | **MISSING.** Only real, admin-entered receipts; zero auto-generation. |

---

## 3. Current Lead Status Fields, Allowed Values & Write Sites

### 3.1 Status Fields & Enumerations
The system tracks two distinct status concepts on each case document:
1. **Lifecycle Status (`case.status`):** Defined in `frontend/src/features/cases/types.ts`:
   - `lead` (Initial uncontacted intake)
   - `lead_qualified`
   - `docs_in_progress`
   - `docs_collected`
   - `file_logged_in`
   - `in_review_lender`
   - `queries_raised`
   - `sanctioned`
   - `disbursed`
   - `pdd_pending`
   - `pdd_completed`
   - `closed`
   - `rejected`
   - `withdrawn`
   *Additive extension:* Extend with `interested`, `not_interested`, `follow_up`, `partner_allocated`.
2. **Telecaller Outcome (`case.call_outcome`):**
   - `new`
   - `interested`
   - `not_interested`
   - `follow_up`
   - `not_reachable`
   - `duplicate`

### 3.2 Complete Inventory of Status Write Sites

| File & Location | Operation / Trigger | Fields Written | Notes |
|---|---|---|---|
| `frontend/src/shared/lib/api.ts` (L1120-1185) | `POST /cases` (Case creation) | `status = 'lead'`, `call_outcome = undefined`, `status_history.unshift(...)` | Initializes new lead record. |
| `frontend/src/shared/lib/api.ts` (L441-470 & L982-1010) | `POST /cases/assign` (Lead assignment) | `assigned_telecaller_id`, `assigned_telecaller_name`, `updated_at` | Assigns telecaller. Leaves lifecycle status intact. |
| `frontend/src/shared/lib/api.ts` (L473-529 & L1012-1030) | `POST /cases/:id/call-activity` (Telecaller outcome) | `call_outcome`, `telecaller_remarks`, `follow_up_at`, `call_attempts_count`, `call_activity_history.unshift(...)` | Records outreach outcome and increments attempts. |
| `frontend/src/shared/lib/api.ts` (L381-421) | `POST /cases/:id/status` (Lifecycle transition) | `status`, `status_history.unshift(...)`, `version`, `updated_at` | Updates case lifecycle status and triggers customer reconciliation. |
| `frontend/src/features/cases/TelecallerWorkspacePage.tsx` (L148-158) | `handleSaveActivity` (UI optimistic write) | `call_outcome`, `telecaller_remarks`, `follow_up_at`, `call_activity_history` | Optimistic UI update before server sync. |
| `frontend/src/features/cases/CaseDetailPage.tsx` (L210-235) | `handleStatusChange` (UI status update) | `status`, `status_history` via `POST /cases/:id/status` | Admin status change action. |
| `frontend/src/shared/lib/storeSync.ts` (L144-162) | `mergeRemoteCases` (Cross-device cloud merge) | `status`, `call_outcome`, `assigned_telecaller_id` | Reconciles newer remote cloud state into local storage. |

---

## 4. Current Role Model & Enforcement Points

### 4.1 System Roles & Definitions
- **`owner` (DSA Managing Director / Aarav Sharma):** Superuser with all 24 permissions.
- **`manager` (Branch Manager / Priya Patel):** Operational management, assignments, and approvals.
- **`processor` (Sr. Loan Processor / Rohan Verma):** Document underwriting, review, and verification.
- **`accountant` (Chief Accountant / Sanjay Gupta):** Commissions, receipts, and payouts.
- **`field_executive` (Field Officer / Kavita Singh):** On-ground inspection and physical document pickup.
- **`auditor` (Internal Auditor / Meera Iyer):** Read-only governance and compliance logs.
- **`telecaller` (Telecaller Desk / Priya Sharma, Rahul Verma):** Limited permissions: `cases:read`, `cases:update`, `documents:read`, `documents:upload`.

### 4.2 Enforcement Layers
1. **Frontend Route Guards (`ProtectedRoute.tsx`):**
   Checks `usePermission().can(requiredPermission)`. Redirects unauthorized users to `/` with an access alert.
2. **UI Navigation Guards (`Sidebar.tsx`):**
   Filters `NAV_ITEMS` using `can(item.permission)`. Prevents display of admin sections to telecallers.
3. **Workspace View Guards (`DashboardPage.tsx`):**
   `if (user?.role === 'telecaller') return <TelecallerDashboard />`. Completely switches telecallers to their own outreach metrics.
4. **Data Layer Authorization (`api.ts`):**
   - In `POST /cases/assign`: Blocks users with `role === 'telecaller'` from assigning/reassigning leads (returns HTTP 403 `FORBIDDEN`).
   - In `POST /cases/:id/call-activity`: Verifies that if `role === 'telecaller'`, `foundCase.assigned_telecaller_id === active.id`. Rejects unassigned activity with HTTP 403 `FORBIDDEN`.
   - In `GET /cases` and `GET /cases/:id`: Telecallers can only query and retrieve cases where `assigned_telecaller_id === active.id`.
   - In `POST /cases/:id/correct-name`: Excludes telecallers from modifying applicant identity.
5. **Firestore Security Rules (`firestore.rules`):**
   *Current state:* Permissive prototype configuration (`allow read, write: if true;` on `/cases` and `/referral_profiles`).
   *Required state:* Must enforce the same scoping rules directly in Firestore Security Rules for pilot deployment integrity.

---

## 5. Sidebar Restructuring & Relocation Mapping

### 5.1 Admin Sidebar: Current vs Target (Exact 8 Items)

```
CURRENT (10 items):                         TARGET (Exactly 8 items, in order):
1. Dashboard (/ )                           1. Dashboard (/ )
2. Today's Console (/today)                 2. Allocate to Telecaller (/cases/allocate-telecaller)
3. Leads (/cases)                           3. Allocate to Partner (/cases/allocate-partner)
4. Quick Lead Intake (/cases/new)           4. Leads (/cases)
5. Telecaller Workspace (/telecaller)       5. Referral Partners (/referrals)
6. Referral Partners (/referrals)           6. Telecaller Performance (/telecaller-performance)
7. Public Referral Portal (/referral)       7. Partner Performance (/partner-performance)
8. Borrowers & Customers (/parties)         8. Payout Dashboard (/payout-dashboard)
9. Team & Telecallers (/admin/users)
10. Audit Trail (/admin/audit)
```

### 5.2 Relocation Table for Removed Top-Level Items

| Removed Item | Original Route | New Access Location & Preservation Strategy | Rationale & User Flow |
|---|---|---|---|
| **Today's Console** | `/today` | Preserved via route; linked directly from Dashboard "Due Today" priority widgets and table shortcuts. | Consolidates executive oversight on the main Dashboard while keeping deep-link bookmark compatibility. |
| **Quick Lead Intake** | `/cases/new` | Preserved via route; accessed via prominent primary "+ New Lead" button on both **Leads** (`/cases`) and the **Dashboard** header. | Standard CRM pattern; eliminates duplicate navigation clutter while keeping single-click intake. |
| **Telecaller Workspace** | `/telecaller` | Preserved via route. Displayed **only** when logged-in role is `telecaller`. Removed from Admin navigation. | Admins do not make calling runs; admins monitor calling operations via **Telecaller Performance** and manage assignments via **Allocate to Telecaller**. |
| **Public Referral Portal** | `/referral` | Preserved via route; accessed via "Copy Public Referral Link" button on **Referral Partners** page and partner dossier. | External/guest intake form meant for partners to submit leads, not an internal operational menu. |
| **Borrowers & Customers** | `/parties` | Preserved via route; accessible directly from the customer section in **Lead Profile** dossier and global search. | Customer records are viewed in case context; secondary standalone registry is still reachable via route. |
| **Team & Telecallers** | `/admin/users` | Preserved via route; moved to the TopBar User Profile menu / Settings dropdown (`/admin/users`). | Admin system configuration is accessed through the profile header, keeping operational queues primary. |
| **Audit Trail** | `/admin/audit` | Preserved via route; accessible via Settings dropdown and directly inside the Lead Profile "Timeline & Audit" tab. | Compliance audits are contextual to cases; standalone audit viewer preserved via route. |

---

## 6. Timezone & Scheduling Rules for Follow-ups

### 6.1 Current Behavior & Deficiencies
- `todayDataService.ts` contains `isTodayInTimezone(dateInput, 'Asia/Kolkata')`.
- However, `caseFilters.ts` (L105-107) computes follow-up eligibility using the client's local system time:
  ```ts
  d.getDate() === today.getDate() &&
  d.getMonth() === today.getMonth() &&
  d.getFullYear() === today.getFullYear()
  ```
  This creates bugs for users whose operating system is not set to IST or during UTC day rollover (e.g. 00:00 to 05:30 IST).

### 6.2 Target Standardization (`Asia/Kolkata` / IST)
- All timestamps are stored as UTC instants (`Timestamp` in Firestore, or ISO 8601 strings e.g. `2026-10-21T09:30:00.000Z`).
- A single pure utility module (`istTime.ts` / `leadQueues.ts`) calculates IST day boundaries:
  - `startOfTodayIST()`: 00:00:00.000 IST converted to UTC millisecond instant.
  - `endOfTodayIST()`: 23:59:59.999 IST converted to UTC millisecond instant.
  - `getReportingMonthIST(date)`: `YYYY-MM` computed strictly in Asia/Kolkata timezone.
- Follow-up classification:
  - **Due Today:** `follow_up_at >= startOfTodayIST() && follow_up_at <= endOfTodayIST()`.
  - **Overdue:** `follow_up_at < startOfTodayIST()` and not completed.
  - **Future:** `follow_up_at > endOfTodayIST()`. Future follow-ups never appear in active queues. Overdue follow-ups appear only in the overdue queue and are never labelled "Due Today".

---

## 7. Baseline Test Setup, Build Commands & Verification

### 7.1 Command Suite
- **Type Check:** `npm run type-check` (`tsc --noEmit`)
- **Production Build:** `npm run build` (`tsc -b && vite build`)
- **Test Suite:** `npm test` (`vitest run`)
- **Linter:** `npm run lint` (`eslint . --max-warnings 0`)

### 7.2 Baseline Execution Results
1. **Vitest Test Suite:**
   - Command: `npm test`
   - **Result: 22 test files passed, 193 tests passed (0 failures).**
   - Duration: 6.85 seconds.
2. **Production Build:**
   - Command: `npm run build`
   - **Result: Success (0 TypeScript errors, bundle generated in `dist/` in 7.85s).**
3. **Linter Baseline:**
   - Command: `npm run lint`
   - **Result: Pre-existing failure with 251 problems (248 `@typescript-eslint/no-explicit-any` errors in test files and mock files).**
   - Note: These are pre-existing in legacy test fixtures. All new production and test code created for this task will strictly adhere to typed interfaces with 0 lint violations.

---

## 8. Requirements Gap Analysis

| Requirement | Existing Codebase State | Changes Required |
|---|---|---|
| **Two-level status model (Lead stage vs Allocation status)** | Only single `case.status` and `case.call_outcome` exist. No concept of partner-level status. | Extend `CaseStatus` with `Interested`, `Not Interested`, `Follow-up`, `Partner Allocated`. Create pure function `deriveLeadStageFromAllocations` with unit tests. |
| **Unified Queue Definitions (`leadQueues.ts`)** | Ad-hoc predicates scattered across `caseFilters.ts` and `todayDataService.ts`. | Build centralized selector module `leadQueues.ts` computing all 6 queues in `Asia/Kolkata`. Import into Dashboard, tables, and tests. |
| **Financing Partners Master (`financingPartners`)** | Lenders exist as informal strings or mock entities in `LendersPage.tsx`. No type distinction. | Create `financingPartners` collection (`id, name, type: bank\|nbfc, active, createdAt, createdBy`). Provide idempotent seed for HDFC Bank, SK Finance, Axis Bank, Other. |
| **Partner Allocations (`partnerAllocations`)** | No multi-lender allocation entity. Cases have only a single optional lender string. | Create `partnerAllocations` collection with deterministic ID `${leadId}_${financingPartnerId}`. Add transaction-based multi-lender allocation API. |
| **Allocate to Telecaller Page** | Telecaller assignment modal exists; no dedicated full queue page. | Implement `/cases/allocate-telecaller` with multi-select bulk assignment, atomic transactions, and real-time counter updates. |
| **Allocate to Partner Page** | No screen exists for allocating interested leads to financing partners. | Implement `/cases/allocate-partner` with partner multi-select, conflict prevention, and atomic stage transition to `Partner Allocated`. |
| **Partner Performance Page** | No partner performance analytics exist. | Implement `/partner-performance` with date-range filter (current month IST default), allocation counts, sanction rates (with "-" for 0 denominator), and drill-down drawers. |
| **Telecaller Performance Page** | Embedded summary widget on Dashboard only. | Implement dedicated `/telecaller-performance` page deriving metrics solely from real `call_activity_history` events with date filtering and drill-down detail. |
| **Payout Policy & Calculation Engine** | Static mock payout rules page (`PayoutRulesPage.tsx`). | Implement versioned `payoutPolicies` schema and pure calculation engine `payoutCalculator.ts` supporting `slab` vs `cliff` mode using integer paise/decimal arithmetic. |
| **Payout Dashboard** | Static payout page (`PayoutExpectationsPage.tsx`). | Implement `/payout-dashboard` displaying real volume, earned payout, receipts, milestone progress, and "View Source" allocation drill-downs. |
| **Admin Sidebar (Exact 8 Items)** | 10 items with legacy sub-routes. | Reorganize `Sidebar.tsx` into the exact 8 items specified; hide allocation/payout items from telecallers; maintain route redirects. |
| **Dashboard KPIs & Clean Layout** | 6 cards including Follow-ups; embedded chart and telecaller table. | Remove Inflow Chart, embedded telecaller section, and Follow-ups card. Implement compact KPI row reconciling 1:1 with filtered lists, with definition tooltips. |
| **Firestore Security Rules** | Permissive prototype rules (`allow read, write: if true;`). | Add rules restricting telecallers to assigned leads, restricting financial/payout/allocation writes to admins, and securing master data. |

---

## 9. Implementation Plan (Phased Execution)

### Phase 1: Shared Modules, Utilities & Data Models
1. **IST Time & Queue Engine (`src/shared/lib/leadQueues.ts`):**
   - Day boundary calculations in `Asia/Kolkata`.
   - Single pure selector functions: `getAllocateToTelecallerQueue`, `getTelecallerActiveCallingQueue`, `getTelecallerDueTodayQueue`, `getTelecallerOverdueQueue`, `getAllocateToPartnerQueue`, `getPartnerAllocatedQueue`.
   - Pure function `deriveLeadStageFromAllocations`.
   - Comprehensive unit tests in `src/test/lead_queues.test.ts`.
2. **Payout Calculation Engine (`src/shared/lib/payoutCalculator.ts`):**
   - Pure function supporting `slab` and `cliff` modes with integer paise arithmetic and INR formatting.
   - Handles milestone thresholds, remaining amounts, and missing policy states.
   - Comprehensive unit tests in `src/test/payout_calculator.test.ts`.
3. **Data Schemas & Store Sync (`src/shared/lib/storeSync.ts` & `src/shared/types`):**
   - TypeScript interfaces and localStorage/Firestore sync for `financingPartners`, `partnerAllocations`, `payoutPolicies`, `payoutReceipts`.
   - Idempotent master seed for default financing partners (`HDFC Bank`, `SK Finance`, `Axis Bank`, `Other`).

### Phase 2: Allocation Workflows & Operational Pages
1. **Allocate to Telecaller (`src/features/cases/AllocateToTelecallerPage.tsx`):**
   - Table of eligible unassigned leads (`assignedTelecallerId` empty, initial stage, not Not Interested).
   - Atomic assignment transaction with conflict handling ("Already assigned").
   - Multi-select bulk assignment with row-level status.
2. **Allocate to Partner (`src/features/cases/AllocateToPartnerPage.tsx`):**
   - Table of eligible Interested leads with zero active allocations.
   - Multi-select financing partner assignment with deterministic ID `${leadId}_${financingPartnerId}`.
   - Atomic creation of allocations and transition of lead stage to `Partner Allocated`.
   - Modal for partner status updates (`In Process`, `Sanctioned` with required numeric amount, `Rejected` with reason).
3. **Lead Profile Integration (`src/features/cases/CaseDetailPage.tsx`):**
   - Add **Allocations Panel** displaying all allocated financing partners, statuses, dates, and sanction amounts.
   - Audit trail verification.

### Phase 3: Performance, Analytics & Payouts
1. **Partner Performance Page (`src/features/reports/PartnerPerformancePage.tsx`):**
   - Aggregated metrics per financing partner from real `partnerAllocations`.
   - Sanction rate formulas with "-" handling for 0 denominators.
   - Clickable row drawer listing contributing leads and sanction amounts.
2. **Telecaller Performance Page (`src/features/reports/TelecallerPerformancePage.tsx`):**
   - Aggregated metrics per telecaller from genuine `call_activity_history`.
   - Explicit interest rate calculation with stated denominator.
   - Clickable detail drawer showing calls, remarks, and outcome breakdown.
3. **Referral Partner Profile Enhancement (`src/features/referrals/ReferralPartnersPage.tsx`):**
   - Traceable partner outcomes and financing partner allocations in profile dossier.
4. **Payout Dashboard (`src/features/payout/PayoutDashboardPage.tsx`):**
   - Financing partner policy cards, business volume, estimated payable, payout earned, receipts, milestone progress bar, and "View Source" allocation drill-downs.

### Phase 4: Navigation, Dashboard Alignment & Security Rules
1. **Sidebar Simplification (`src/shared/components/Sidebar.tsx`):**
   - Restructure to exact 8 items in order.
   - Hide allocation, performance, and payout items from `telecaller` role.
   - Ensure preserved routes redirect cleanly without broken bookmarks.
2. **Dashboard Clean-up (`src/features/dashboard/DashboardPage.tsx`):**
   - Replace old KPI cards with compact 7-card row reconciling 1:1 with filtered lists.
   - Remove chart, embedded telecaller section, and follow-ups card.
   - Add definition tooltips to all KPIs.
3. **Firestore Security Rules & Indexes (`firestore.rules`, `firestore.indexes.json`):**
   - Add collection rules for `financingPartners`, `partnerAllocations`, `payoutPolicies`, `payoutReceipts`.
   - Enforce telecaller assignment restrictions and admin write protections.
4. **End-to-End Verification & Documentation:**
   - Validate all 16 acceptance test scenarios.
   - Run typecheck, tests, and build.
   - Update `DECISIONS.md`, `PROGRESS.md`, and generate final report.
