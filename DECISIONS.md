# Architectural Decisions & Mapping Records (DSA OS)

This document records architectural decisions, assumptions, and domain mapping logic adopted for the Jai Automobiles DSA OS Lead-to-Partner Allocation Workflow and Sidebar Simplification.

---

## ADR-001: Two-Level Status Model & Stage Mapping

### Context
Leads go through outreach by telecallers before being allocated to one or more financing partners (banks/NBFCs). Each financing partner processes the loan independently. A single case must track its overall operational stage while maintaining partner-specific statuses for each allocated financing partner.

### Decision
1. **Lead Stage (`case.status`):**
   - Initial states: `lead`, `lead_qualified`, `docs_in_progress`, `docs_collected`, `file_logged_in`, `in_review_lender`, `queries_raised`.
   - Outreach states: `Interested`, `Not Interested`, `Follow-up`.
   - Allocation states: `Partner Allocated`.
   - Sanction/Closure states: `Sanctioned`, `Disbursed`, `Closed`, `Rejected`, `Withdrawn`.
2. **Allocation Status (`partnerAllocation.status`):**
   - Stored per allocation record only: `Allocated`, `In Process`, `Sanctioned`, `Rejected`.

### Lead Stage Derivation Function (`deriveLeadStageFromAllocations`)
Lead stage transitions resulting from allocations are computed strictly via a pure function:
- If a lead has zero allocations and telecaller marked it interested: `Interested`.
- First successful allocation to one or more partners: transitions lead stage to `Partner Allocated`.
- If an allocation is rejected:
  - Rejected allocations **never** change the lead to `Not Interested`.
  - If other allocations remain `Allocated` or `In Process`, lead stage remains `Partner Allocated`.
  - If **all** allocations for a lead are `Rejected`, lead stage remains `Partner Allocated` (with derived indicator "All Allocations Rejected - Eligible for Reallocation").
- If any allocation is `Sanctioned`:
  - Lead stage becomes `Sanctioned` (as supported by the existing `CaseStatus` model).
  - Derived badges surface "Sanctioned (1/2 partners)" without prematurely mutating the lead to `Converted` or `Disbursed`.
  - Never auto-set `Converted` or `Disbursed` from an allocation sanction; disbursement requires actual loan disbursement confirmation.

---

## ADR-002: Deterministic Document ID for Multi-Partner Allocation

### Context
A lead may be submitted to multiple financing partners simultaneously (e.g. HDFC Bank and Axis Bank) to compare sanction offers. However, allocating the same lead to the same partner twice would duplicate business volume and create payout tracking errors.

### Decision
- Allocation document IDs are generated deterministically as:
  ```
  ${leadId}_${financingPartnerId}
  ```
- This guarantees uniqueness at the database layer (Firestore document key). Concurrent or duplicate allocations to the same partner are rejected or idempotent without creating duplicate records.
- Reallocation to a previously rejected partner requires an explicit administrative operation that archives the prior attempt in the allocation's `history` sub-array rather than deleting historical records.

---

## ADR-003: Pure Selector Queue Engine (`leadQueues.ts`) & IST Boundaries

### Context
KPI cards on the Dashboard, Today's Console, and operational queue tables must reconcile 1:1. Ad-hoc query filters in separate UI components previously caused metric drift across timezones and UTC midnight rollovers.

### Decision
- All queues are defined in a single pure module `leadQueues.ts`.
- All calendar day boundary queries use `Asia/Kolkata` (IST):
  - Day start: 00:00:00.000 IST
  - Day end: 23:59:59.999 IST
- Queue definitions:
  1. **Allocate to Telecaller:** `assignedTelecallerId` is empty AND stage is initial/new AND stage != `Not Interested`.
  2. **Telecaller Active Calling:** Assigned to telecaller AND stage in calling/contacting AND no outstanding future follow-up.
  3. **Telecaller Due-Today:** Assigned to telecaller AND `follow_up_at >= startOfTodayIST` AND `follow_up_at <= endOfTodayIST`.
  4. **Telecaller Overdue:** Assigned AND `follow_up_at < startOfTodayIST` AND not completed.
  5. **Allocate to Partner:** stage = `Interested` AND zero allocation records for the lead.
  6. **Partner Allocated / In Process:** Lead has $\ge 1$ allocation with status `Allocated` or `In Process`.

---

## ADR-004: Strict Separation of Referral Partners and Financing Partners

### Context
DSA operations involve two distinct external parties:
1. Referral partners (dealers, sub-brokers, connectors) who introduce prospective borrowers.
2. Financing partners (banks and NBFCs) who underwrite, sanction, and disburse loans.

### Decision
- Referral partners are stored in `referral_profiles` and managed under `/referrals`.
- Financing partners are stored in `financingPartners` and managed under partner allocation and performance.
- They must **never** share collection names, ID namespaces, or UI labels.

---

## ADR-005: Payout Calculation Engine Design (`payoutCalculator.ts`)

### Context
Financing partners compensate the DSA based on monthly disbursed or sanctioned loan volume according to pre-agreed tiered incentive structures (slab vs cliff).

### Decision
- **Money representation:** Integer paise (1 INR = 100 paise) internally to eliminate floating-point rounding errors.
- **Slab mode:** Each tier's rate percentage applies strictly to the incremental volume within that tier's range `(minAmount, maxAmount)`.
- **Cliff mode:** The rate of the highest tier reached applies to the entire business volume.
- **Milestone tracking:** Smallest tier threshold above current volume indicates the next target; remainder is `threshold - volume`.
- **Missing policy:** Renders clear "Policy not configured" state rather than defaulting to ₹0 or guessing arbitrary rates.
- **Receipts:** Receipts come solely from real admin-recorded entries (`payoutReceipts`); never simulated or auto-generated.

---

## ADR-006: Admin Sidebar Simplification (Exact 8 Items)

### Context
The previous sidebar had 10 items, including mixed telecaller and admin destinations. Telecallers were exposed to high-level administrative screens.

### Decision
The Admin sidebar contains exactly 8 items in the specified sequence:
1. `Dashboard` (`/`)
2. `Allocate to Telecaller` (`/cases/allocate-telecaller`)
3. `Allocate to Partner` (`/cases/allocate-partner`)
4. `Leads` (`/cases`)
5. `Referral Partners` (`/referrals`)
6. `Telecaller Performance` (`/telecaller-performance`)
7. `Partner Performance` (`/partner-performance`)
8. `Payout Dashboard` (`/payout-dashboard`)

Telecallers only see their dedicated workspace (`/telecaller`); they never see allocation, performance, or payout navigation items.
All removed routes (`/today`, `/cases/new`, `/parties`, `/admin/users`, `/admin/audit`) remain registered in the router to preserve deep links and bookmarks, with primary navigation provided through contextual actions and profile menus.
