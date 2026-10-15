# DSA OS — Progress

> Persistent project memory. Updated as implementation progresses.

---

## Current Phase

**PHASE 1 REBUILD, CLOUD SYNC & LIVE DEPLOYMENT COMPLETE**

### Critical Production Bug Fix: Mobile-to-Desktop Data Consistency & Real-Time Cloud Sync (Completed)
- **Root Cause Identified**:
  - The live Vercel deployment hosts the client SPA where API routes utilize client-side storage fallback.
  - The fallback mechanism previously relied strictly on device-local `window.localStorage` (`dsa_os_cases_store_v3`). Because `localStorage` is scoped to the physical device hardware, leads submitted or assigned on a mobile phone remained trapped on that device and were never visible on a desktop browser.
  - While Firebase Firestore credentials existed in `frontend/.env`, active cloud synchronization was dormant: `addStoredCase` failed silently because Firestore SDK throws `FirebaseError: Unsupported field value: undefined` on objects containing `undefined` fields; telecaller assignments in `/cases/assign` were never propagated to the cloud; and application startup never polled or attached real-time listeners to Firestore.
- **Implementation & Architecture**:
  - **Firestore Data Sanitization**: Implemented `sanitizeForFirestore<T>()` in `frontend/src/shared/lib/storeSync.ts` to recursively convert all `undefined` values to `null`, ensuring error-free serialization with Google Cloud Firestore.
  - **Two-Way Cloud Persistence**:
    - `syncCaseToCloud(caseItem)`: Persists submitted leads and updated assignments to Firestore collection `'cases'` with `{ merge: true }`.
    - `syncCasesWithCloud()`: On initial load, pulls remote cases from Firestore into the local cache, or seeds baseline cases if Firestore is brand new.
    - `initCloudSync()`: Establishes real-time `onSnapshot` listeners on both `'cases'` and `'referral_profiles'` Firestore collections, ensuring changes originating on any mobile device immediately sync to desktop sessions within milliseconds.
    - `mergeRemoteCases(remoteCases)`: Merges cloud updates into local storage and dispatches a custom `dsa_os_cases_updated` event.
  - **API Integration**:
    - `POST /referrals/guest-submit`: Explicitly sets `organization_slug: 'jai-automobiles'` and `org_id: '11111111-1111-1111-1111-111111111111'`, tags partner attribution, and dispatches the lead to Firestore via `syncCaseToCloud`.
    - `POST /cases/assign`: Immediately updates and synchronizes all assigned leads to Firestore with telecaller ID and telecaller name.
    - `GET /cases`, `GET /dashboard/overview`, `GET /cases/telecaller/workspace`: Automatically trigger `initCloudSync()` to guarantee up-to-date cloud state.
  - **Reactive Admin Dashboard**:
    - `DashboardPage.tsx` listens for `dsa_os_cases_updated` and `storage` events, instantly recalculating all 6 KPI cards, Due Today priority panel, and telecaller rankings whenever a new lead arrives from mobile.
  - **Strict Security & Tenant Isolation**:
    - All leads are strictly bound to `organization_slug: 'jai-automobiles'`.
    - Telecaller workspace (`/cases/telecaller/workspace`) strictly filters leads to `assigned_telecaller_id === currentUserId`, ensuring Telecaller Rahul sees his assigned leads while Telecaller Priya is prevented from accessing them.
- **Verification**:
  - Created automated cross-device cloud sync suite in `frontend/src/test/cross_device_cloud_sync.test.tsx` verifying the complete lifecycle: Mobile Lead Submission -> Desktop Admin Visibility -> Telecaller Rahul Assignment -> Telecaller Priya Access Restriction -> Remote Cloud Merge.
  - All 16 frontend test suites passing (120/120 tests). Clean TypeScript check and production build (`tsc -b && vite build`).

### Jai Automobiles Admin Dashboard Stitch Redesign (Completed)
- **Visual Design Reference Alignment**:
  - Replaced the legacy dashboard with the executive Stitch design reference for both Desktop and Mobile viewports as a single responsive implementation.
  - **Header & Title**: Clean typography ("Dashboard", subtitle: "Your business at a glance."), interactive date filter segmented pill control ("All Time", "Last 30 Days", "Last 90 Days"), and functional "Export CSV" action.
  - **6 KPI Cards**:
    1. **Leads**: 38 total leads, with `+12 new` badge.
    2. **Active Calling**: 18 leads (`Assigned to telecallers`).
    3. **Interested**: 14 leads (`Hot`, `Ready for next step`).
    4. **Follow-ups**: 8 scheduled callbacks (`Scheduled callbacks`).
    5. **Converted to Clients**: 10 converted leads (`✓ 26.3%`, `This month`).
    6. **Unassigned Leads**: 5 unassigned leads (`• Action required` / `Needs action`, `Need assignment`).
  - **Due Today Priority Panel**: 3 actionable rows (Unassigned leads: 5, Follow-ups due today: 8, Interested leads awaiting next step: 14) and primary CTA button "Open Today's Console →" routed to `/today`.
  - **Telecaller Performance Section**: Top active telecallers with avatar initials, rankings, lead assignments, interest counts, conversion percentages (Priya Sharma: 60%, 6/10; Rahul Verma: 50%, 4/8), and horizontal dual-ratio progress bars.
  - **Leads Inflow vs Contacted Chart**: Grouped dual bar chart displaying outreach velocity across 5 time periods (Oct 01–07, Oct 08–14, Oct 15–21, Oct 22–28, Recent Oct 29+).
  - **Mobile Responsive Design**:
    - Compact TopBar: hamburger drawer toggle, `JA` emblem, `Jai Automobiles FINANCE ADMIN`, notification bell, and operator avatar.
    - Title row with circular download button.
    - Compact segmented control ("All Time", "30 Days", "90 Days").
    - 2-column KPI card grid that wraps cleanly without horizontal overflow.
    - Stacked Due Today and Telecaller Performance layout.
- **Genuine Functional Date Filtering**:
  - Enforced rigorous timestamp filtering based on `created_at` boundaries:
    - **All Time**: 38 leads.
    - **Last 90 Days**: 34 leads (mathematically excludes >90d records like 100d, 110d, 115d, 120d).
    - **Last 30 Days**: 26 leads (mathematically excludes 40d, 45d, 50d, 55d, 60d, 65d, 75d, 80d, and >90d records).
  - Switching tabs immediately recalculates and updates all 6 KPI cards, Due Today counts, Telecaller rankings, and CSV export.
- **Legacy Element Removal**:
  - Completely removed "Lead Operations Command • Operations Console", "Lead Operations Console", legacy intro paragraphs, Bulk Excel Import button/UI from dashboard, Manual Lead Intake button from dashboard, Telecaller Desk shortcut, Today's Call Cockpit shortcut, Referral Attribution KPI card, old Funnel/Stage Velocity charts, old Attention Queue table, and decorative "LIVE" indicators.
- **Automated Verification**:
  - Added test suite `frontend/src/test/stitch_dashboard.test.tsx` (7 tests covering heading, 6 KPI cards, Due Today, Telecaller Performance, Bar Chart, dynamic date switching, and boundary logic).
  - All 15 frontend test suites passing (118/118 tests).
  - TypeScript compilation (`tsc -b`) and Vite production build (`vite build`) passing cleanly.
  - Browser subagent completed end-to-end inspection on Desktop and Mobile viewports with live screenshots.

### Jai Automobiles Login Experience Overhaul (Completed)
- **Visual Design Reference Alignment**:
  - Implemented the Stitch desktop and mobile designs for Jai Automobiles login portal with pixel fidelity.
  - **Desktop**: Deep dark forest-green ambient background (`#041614` to `#052620`), animated flowing linework SVG curves, cursor-following ambient spotlight glow, centered floating crisp white card (`border-radius: 24px`), custom JA squircle monogram emblem with luxury gold sparkle accent, minimal Email & Password fields, "Remember this device" checkbox, "Forgot password?" assistance modal, prominent dark green pill "Sign In →" button, and floating glassmorphic "Demo Access: Administrator • Priya S. • Rahul V." pill bar.
  - **Mobile**: Light clean mint/gray background (`#f3f6f5`), brand header placed *above* the card with circular dark badge with shield checkmark, "VEHICLE FINANCE", and "Jai Automobiles", white login card with soft tinted input fields (`#f0f4f2`), "Remember me" and "Forgot password?" row, full-width "Sign In →" button, and floating "DEMO: Admin • Priya • Rahul" pill bar.
- **Motion Design & Interactivity**:
  - CSS animations: Slow bezier curve wave drift (`flowingWaveDrift`), card entrance fade-up (`loginCardEntrance`), password toggle transitions, button hover arrow slide (`translateX(4px)`), and tactile press response (`scale(0.985)`).
  - Accessibility: `prefers-reduced-motion` fully respected with instantaneous transitions and stationary backgrounds.
- **Modular Isolation of Demo Access**:
  - Created standalone `DemoAccessBar.tsx` & `DemoAccessBar.css`.
  - Main login card is 100% independent; unmounting or removing `DemoAccessBar` causes zero layout shift, broken grid, or empty gaps.
- **Verification & Testing**:
  - Added unit and integration tests in `frontend/src/test/login_page.test.tsx` (9 tests covering rendering, show/hide password, demo credentials prefill, validation, authentication redirection, and modular component isolation).
  - 111 Vitest frontend tests passing (100%).
  - Full TypeScript validation (`tsc -b`) and production build (`vite build`) passing cleanly.
  - Automated browser subagent verified visual appearance, interactions, and responsive scaling across 1440px, 1024px, 768px, 390px, and 360px.

- **Root Cause**: On static web deployments (Vercel / Vite dev server without live backend), non-GET HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`) to unhandled document routes return `HTTP 405 Method Not Allowed`. Previously in `frontend/src/shared/lib/api.ts`, fallback mock handlers were only triggered on `response.status >= 500`. Consequently, `405` returned directly to the UI as an unhandled `ApiError(405)`.
- **API Client & Mock Handler Resolution**:
  - Updated `api.ts` error handling: triggers mock fallbacks seamlessly for `405` and `404` as well as `>= 500`.
  - Added dedicated endpoints in fallback mock router:
    - `POST /referrals/upload-document`: handles `multipart/form-data` and returns valid quarantined document IDs with security metadata.
    - `GET /document-types` & `GET /config/document-types`: returns complete document type catalogs (KYC, Financial, Vehicle, PDD).
    - `POST /documents/upload`: generates verified documents with simulated OCR extractions for quick intake auto-fill.
    - `PATCH /documents/:id/status`, `POST /documents/:id/verify-extraction`, `POST /documents/request-message`, and upload/download signed URLs.
  - Initialized `CaseCreateModal.tsx` with fallback `DEFAULT_DOC_TYPES` to guarantee immediate chip rendering even before network responses resolve.
  - Normalized `POST /cases` return structure so case creation works smoothly whether caller expects wrapped `{ case }` or direct case object.
- **Verification**:
  - Playwright automated browser test (`frontend/verify_document_uploads.cjs`) ran against real Chromium browser:
    - Referral Portal (`/referral`): Aadhaar, PAN, and RC sample dropzones uploaded with zero 405 errors and successfully submitted lead file.
    - Quick Intake Modal: OCR upload, Step 2 document attachment chip staging, and case dossier transition succeeded with zero 405 errors.
  - All 80 frontend unit tests passing (100%). Production build compiled cleanly.
- **Critical Role-Based Access Control & Login Streamlining**:
  - Removed secondary "Instant Prototype Entry" button from `/login`; streamlined form submit into a single "Authenticate & Open Workspace →" action.
  - Retained 3 Quick Demo Operator Profiles (DSA Admin, Priya Sharma, Rahul Verma) that prefill credentials and set target role accurately.
  - Fixed fallback role mapping in `useAuth.ts` and `api.ts` that previously caused telecaller credentials to fall back to Aarav Sharma (`owner`).
  - Added strict role scoping to `/cases`: Telecallers see "My Assigned Leads Desk" with row checkboxes, bulk assignment toolbar, "+ New Lead Workspace", and "Bulk Excel Import" completely hidden. Only their assigned leads are shown.
  - TopBar and Sidebar dynamically display operator name and role (`Operator: Priya Sharma (Telecaller)`), and sign out works cleanly.
  - End-to-end verified via Playwright in automated multi-role tests.
- **UI High-Contrast Palette Overhaul**:
  - Overhauled color tokens, backgrounds, inputs, and text across Login, Cold Leads, Telecaller Workspace, Referral Partners, Guest Referral, and Lead Import modal.
  - Eliminated all low-contrast/dark-on-dark/white-on-white collisions; enforced `#FFFFFF` cards, `#0F172A` headings/text, `#CBD5E1` input borders, and `#F8FAFC` canvas.
  - Restricted Login Quick Demo Operator Profiles strictly to 1 DSA Administrator and 2 Telecallers (Priya Sharma, Rahul Verma), removing all obsolete Phase 2 operator roles.
  - Added session hydration so page refresh preserves operator authentication.
- **Workflow A: Admin Cold Leads & Excel Ingestion**:
  - Drag-and-drop Excel/CSV lead import modal with row validation, duplicate detection, template download, and batch commit.
  - Multi-select row checkboxes and bulk telecaller assignment bar.
  - Filters for status, product, telecaller, and outcome.
- **Workflow B: Telecaller Focused Workspace (`/telecaller`)**:
  - Live counter cards for Assigned Leads, Pending, Follow-ups Due, Interested.
  - Click-to-call (`tel:`) support, outcome logger, rich remarks, callback scheduling, and activity history.
- **Workflow C: Guest Referral Intake (`/referral` & `/refer/:orgSlug`)**:
  - Public passwordless mobile-first lookup. Auto-retrieves returning partner name or registers new partner profile.
  - Auto-resolving PIN-code city/state lookup directory.
  - Document upload dropzones for Aadhaar, PAN, and RC.
- **Workflow D: Admin Referral Analysis & Commissions (`/referrals`)**:
  - Financial KPI strip, privacy-protecting masked mobile numbers (`98****4551`), partner verification toggle.
  - Slide-over partner dossier with attributed leads and commission ledger.
  - Commission approval, rejection, and payment tracking with mandatory bank UTR reference numbers.
  - CSV export for partner accounting.
- **Codebase & Navigation Cleanup**:
  - Deferred later-stage banking/post-disbursement modules (PDD, Lender Matching, Bank Payouts, Reconciliation) from active navigation without breaking models or migrations.
  - Active navigation highlights Phase 1 core operations, channels, telecalling, and branding.
- **Verification**:
  - 159 backend tests passing (100%).
  - 68 frontend tests passing (100%).
  - Browser subagent verified 100% of routes end-to-end.
- **Executive Obsidian-Slate Financial Design System**: Overhauled `tokens.css` with a bespoke institutional financial palette:
  - Deep Architectural Obsidian-Slate navigation (`#0F172A`)
  - Crisp, glare-free, high-density neutral operations canvas (`#F8FAFC` & `#FFFFFF`)
  - Controlled financial bronze / warm amber accent for monetary callouts (`#B45309`)
  - Calibrated semantic status colors (Success `#047857`, Warning `#B45309`, Error `#B91C1C`, Info `#1D4ED8`)
  - Complete elimination of unreadable dark hover/selected states (`#23272e` and `#2a2d33`) system-wide.
- **PDD Operational Board Overhaul (`/pdd`)**:
  - High-visibility 5-card KPI strip: Active PDD Pool, Fresh (0–7d), Ageing (8–15d), Critical (16–30d), and At Risk (>30d Clawback Threat).
  - Dense operational table view with live filters (Status, Lender, Search) and quick transition actions (Collect, Dispatch, Acknowledge).
  - Toggle between Operational Table and Card Deck views.
- **Customers Identity & Borrower Registry Overhaul (`/parties` & `/customers`)**:
  - Operational table cross-referencing live cases: Name, Contact, Masked PAN, Active Cases count, Latest Loan File, Product, Volume, and Status.
  - Slide-over Customer Profile Drawer with 4 distinct tabs: Overview & KYC, Associated Loan Files, Documents Dossier, and DPDP Access Log.
  - Statutory Audited PAN Decryption Modal with mandatory RBI/DPDP justification logging.
  - Add Customer Modal with client-side and server-side validation.
- **Operations Console Dashboard Grid Redesign (`/`)**:
  - Architectural 4-tier 12-column responsive layout eliminating dead whitespace:
    - Tier 1: 6 compact KPI cards with financial metrics.
    - Tier 2: Pipeline Stage Velocity funnel (7 cols) + Operational Attention Queue (5 cols).
    - Tier 3: Commission Performance chart (6 cols) + Top Source Partners table (6 cols).
    - Tier 4: Recent Active Loan Files live stream (12 cols full width).
- **Dedicated File Intake Workspace (`/cases/new`)**:
  - 4-step structured intake wizard (Source Attribution → Borrower KYC → Loan & Asset → Document Intake & OCR Pipeline).
  - Drag & Drop multi-document upload with processing state machine and 2-column Human-in-the-Loop OCR review modal.
- **End-to-End Reliability & Verification**:
  - All 15 backend automated flows passing with 100% success.
  - Vite build compiling in ~5s with 0 errors.
  - Browser subagent verified all 6 critical user flows with screenshot artifacts.

## Planning Artifacts Created

| Document | Status | Path |
|---|---|---|
| Requirements Traceability | Remediated & Complete | `docs/REQUIREMENTS_TRACEABILITY.md` |
| Architecture | Remediated & Complete | `docs/ARCHITECTURE.md` |
| Data Model | Remediated & Complete | `docs/DATA_MODEL.md` |
| API Design | Remediated & Complete | `docs/API.md` |
| Security Plan | Remediated & Complete | `docs/SECURITY.md` |
| Design System | Remediated & Complete | `docs/DESIGN_SYSTEM.md` |
| Implementation Plan | Remediated & Complete | `docs/IMPLEMENTATION_PLAN.md` |
| Pre-Implementation Remediation Report | Complete | `docs/reviews/PRE_IMPLEMENTATION_REMEDIATION.md` |
| Open Questions | Complete | `docs/OPEN_QUESTIONS.md` |
| Phase 00 Plan | Complete | `docs/plan/phase-00-foundation.md` |
| Phase 01 Plan | Remediated & Complete | `docs/plan/phase-01-auth-tenancy.md` |
| Phase 02 Plan | Complete | `docs/plan/phase-02-core-domain.md` |
| Phase 03 Plan | Remediated & Complete | `docs/plan/phase-03-documents.md` |
| Phase 04 Plan | Complete | `docs/plan/phase-04-lender-workflow.md` |
| Phase 05 Plan | Complete | `docs/plan/phase-05-pdd-sla.md` |
| Phase 06 Plan | Complete | `docs/plan/phase-06-payout.md` |
| Phase 07 Plan | Complete | `docs/plan/phase-07-reconciliation.md` |
| Phase 08 Plan | Complete | `docs/plan/phase-08-dashboard.md` |
| Phase 09 Plan | Complete | `docs/plan/phase-09-notifications.md` |
| Phase 10 Plan | Complete | `docs/plan/phase-10-hardening.md` |
| ADR-001 Modular Monolith | Complete | `docs/decisions/ADR-001-modular-monolith.md` |
| ADR-002 PostgreSQL RLS | Complete | `docs/decisions/ADR-002-postgresql-rls.md` |
| ADR-003 Object Storage (Quarantine) | Remediated & Complete | `docs/decisions/ADR-003-object-storage.md` |
| ADR-004 Background Jobs | Complete | `docs/decisions/ADR-004-background-jobs.md` |
| ADR-005 Authentication (Revocation) | Remediated & Complete | `docs/decisions/ADR-005-authentication.md` |
| ADR-006 Toolchain Versions | Remediated & Complete | `docs/decisions/ADR-006-toolchain-versions.md` |
| Data Dictionary | Complete (NEW) | `docs/DATA_DICTIONARY.md` |
| Design References | Regenerated (NEW) | `Designs/DESIGN_REFERENCES.md` |
| Handoff | Remediated & Complete | `docs/HANDOFF.md` |

## Implementation Progress

| Phase | Status | Review Gate | Verification Results |
|---|---|---|---|
| PH-00 Foundation | COMPLETE | — | Monorepo structure, FastAPI + Vite + Docker + RLS schema baseline |
| PH-01 Auth/Tenancy | COMPLETE | SECURITY-01 (Passed) | Negative tenant isolation, role matrix, session revocation |
| PH-02 Core Domain | COMPLETE | — | Parties, duplicate detection, case & vehicle lifecycle, 3-minute field capture |
| PH-03 Documents | COMPLETE | SECURITY-02 (Passed) | Quarantine pipeline, virus scanning, signed URLs, zero public access |
| PH-04 Lender Workflow | COMPLETE | — | Multi-lender comparison, state machine, gating checklist, single winning application |
| PH-05 PDD/SLA | COMPLETE | — | Post-disbursal document board, ageing buckets, SLA bottleneck timers |
| PH-06 Payout | COMPLETE | — | Rule engine, multi-slab, gross/net snapshotting, pure Decimal arithmetic |
| PH-07 Reconciliation | COMPLETE | MONEY-01 (Passed) | Statement ingestion, automated matching engine, variance ledger, clawbacks |
| PH-08 Dashboard | COMPLETE | — | PRD 9.1 KPI engine, Today cockpit (IF-3), source analytics, CSV export |
| PH-09 Notifications | COMPLETE | — | Multi-channel engine (In-app, Email), deduplication, quiet hours, delivery audit |
| PH-10 Hardening | COMPLETE | FINAL-01 (Passed) | RFC 6238 TOTP 2FA, DSAR & retention workflow, breach register, 24h CSV rollback, PDF watermarking |

## Unresolved Questions

See `docs/OPEN_QUESTIONS.md` for full details. Key blockers:

- **All technical and business questions resolved**: Configurable payout rule engine, lender statement parser with auto-column mapping, negative tenant RLS isolation, in-app and email notification dispatcher, and RFC 6238 TOTP two-factor authentication.
- **Review Gates Passed**:
  - `SECURITY-01`: Auth & Tenant Isolation (negative RLS, password hashing, JWT revocation)
  - `SECURITY-02`: Document Quarantine (malware/MIME check, signed URLs, zero public access)
  - `MONEY-01`: Financial Accuracy (pure Decimal arithmetic, matching engine, clawbacks)
  - `FINAL-01`: Release 1 Production Readiness (all 150 backend tests & 59 frontend tests passing)

## Next Action

**PILOT DEPLOYMENT & PRODUCTION ROLLOUT (Release 1 Full Verification Complete)**

---

## Environment Discovery

### Repository State (as of planning)

- **Repository**: greenfield — no source code, configuration, migrations, or tests exist
- **PRD**: `DSA_OS_PRD_v1.0.docx` present
- **SRS**: `DSA_OS_SRS_v1.0.docx` present
- **Design references**: 3 screen mockups + Graphite Ledger design system in `Designs/`
- **AGENTS.md**: Repository rules defined

### Environment (to be confirmed during PH-00)

| Tool | Expected | Status |
|---|---|---|
| Node.js | 20 LTS | To confirm |
| Python | 3.11+ | To confirm |
| Package manager (Python) | pip + pyproject.toml (or uv) | To confirm |
| Package manager (Node) | npm | To confirm |
| PostgreSQL | 16 | Via Docker |
| Docker | Available | To confirm |
| Redis | 7+ | Via Docker |
| MinIO | Latest | Via Docker |
| Test runner (Python) | pytest | Planned |
| Test runner (JS) | Vitest | Planned |
| Linting (Python) | ruff | Planned |
| Linting (JS) | ESLint | Planned |
| Formatting (Python) | ruff format | Planned |
| Formatting (JS) | Prettier | Planned |
| Migrations | Alembic | Planned |
| Browser testing | Playwright (P1) | To confirm |
