# DSA OS — Data Dictionary

> SRS-required deliverable. Defines all enumerations, field formats, type constraints, and domain vocabulary.
>
> Source of truth: SRS Appendix A (Business Rules), Appendix C (State Machines), DATA_MODEL.md.

---

## 1. Enumerations

### 1.1 User Roles

| Value | Description | Scope |
|---|---|---|
| `owner` | Organization owner. Full access including user management and audit. | All org data |
| `manager` | Team manager. Case management, document management, team oversight. | All org data |
| `processor` | Case processor. CRUD on cases, documents, lender applications. | All org data |
| `field_executive` | Field agent. Lead capture, document upload, limited status changes. | Own cases only |
| `accountant` | Financial operations. Payout rules, statements, reconciliation. | Financial data |
| `auditor` | Compliance reviewer. Read-only access to audit log and cases. | Read-only |

### 1.2 Case Status

| Value | Description | Color Token | Next Allowed |
|---|---|---|---|
| `lead` | Initial contact captured | `neutral` | `screening` |
| `screening` | Initial qualification | `neutral` | `collecting_docs`, `customer_dropped` |
| `collecting_docs` | Gathering documents | `warning` | `docs_complete`, `customer_dropped` |
| `docs_complete` | All mandatory documents received | `info` | `applied`, `collecting_docs` (backward) |
| `applied` | At least one lender application logged | `info` | `sanctioned`, `all_rejected`, `customer_dropped` |
| `sanctioned` | At least one application sanctioned | `success` | `pre_disbursal`, `cancelled` |
| `pre_disbursal` | Awaiting disbursal | `warning` | `disbursed`, `cancelled` |
| `disbursed` | Loan disbursed | `success` | `post_disbursal`, `cancelled` |
| `post_disbursal` | PDD/RC/hypothecation phase | `info` | `payout_pending` |
| `payout_pending` | Awaiting payout from lender | `warning` | `payout_received` |
| `payout_received` | Payout received and reconciled | `success` | `closed` |
| `closed` | Case fully completed | `neutral` | — (terminal) |
| `customer_dropped` | Customer withdrew before application | `error` | — (terminal, reason required) |
| `all_rejected` | All lender applications rejected | `error` | `rework`, `closed` |
| `rework` | Re-evaluating after full rejection | `error` | `applied` |
| `cancelled` | Cancelled (post-sanction/disbursal opens clawback review) | `error` | — (terminal) |

### 1.3 Lender Application Status

| Value | Description | Next Allowed |
|---|---|---|
| `logged_in` | Application submitted to lender | `under_verification`, `rejected`, `cancelled` |
| `under_verification` | Lender reviewing application | `query_raised`, `sanctioned`, `rejected`, `cancelled` |
| `query_raised` | Lender raised a query | `under_verification`, `rejected`, `cancelled` |
| `sanctioned` | Lender issued sanction | `accepted_by_customer`, `declined_by_customer`, `cancelled` |
| `accepted_by_customer` | Customer accepted the sanction | `disbursed`, `cancelled` |
| `disbursed` | Loan amount disbursed | — (terminal for normal flow; clawback is a separate event) |
| `rejected` | Lender rejected application | — (terminal, reason code required) |
| `declined_by_customer` | Customer declined this sanction | — (terminal) |
| `cancelled` | Application cancelled | — (terminal) |

### 1.4 Document Status (Quarantine Pipeline)

| Value | Description | Download Allowed? |
|---|---|---|
| `quarantined` | File uploaded to quarantine zone, awaiting validation | **NO** |
| `scanning` | Validation worker processing (malware scan, MIME check, EXIF strip) | **NO** |
| `scan_failed` | Validation failed (malware, wrong MIME, size exceeded) | **NO** |
| `received` | Validated and promoted to canonical storage | YES |
| `under_review` | Staff reviewing document | YES |
| `verified` | Staff verified document as valid | YES |
| `rejected` | Staff rejected document (business reason) | YES |
| `expired` | Automatic expiry based on `validity_days` | YES |
| `archived` | Soft-deleted / archived | YES (Owner/Manager only) |

### 1.5 PDD Item Status

| Value | Description |
|---|---|
| `pending` | PDD item not yet received |
| `submitted` | Item submitted, awaiting confirmation |
| `completed` | Item received and confirmed |
| `overdue` | Past due date without completion |

### 1.6 Payout Expectation Status

| Value | Description |
|---|---|
| `no_rule` | No matching payout rule found for this lender+product |
| `held` | Payout computed but gating condition not met (e.g., PDD incomplete) |
| `due` | Gating condition met; payout is expected |
| `received` | Lender payout received (matched to a receipt) |
| `reconciled` | Payout reconciled with expected amount |
| `clawed_back` | Payout clawed back within clawback window |

### 1.7 Payout Receipt Match Status

| Value | Description |
|---|---|
| `unmatched` | No expectation matched to this receipt |
| `matched` | Receipt matched to expectation within tolerance |
| `short` | Receipt amount less than expected |
| `excess` | Receipt amount greater than expected |
| `clawed_back` | Clawback deduction applied |

### 1.8 Reconciliation Result

| Value | Description |
|---|---|
| `matched` | Receipt matches expectation within tolerance |
| `short` | Receipt is less than expected |
| `excess` | Receipt is more than expected |
| `missing` | No receipt found for expectation |
| `manual` | Manually resolved |

### 1.9 Clawback Status

| Value | Description |
|---|---|
| `pending` | Clawback identified, awaiting confirmation |
| `confirmed` | Clawback confirmed |
| `disputed` | Clawback being disputed with lender |
| `reversed` | Clawback reversed |

### 1.10 Notification Status

| Value | Description |
|---|---|
| `pending` | Notification created, not yet delivered |
| `delivered` | Delivered to user |
| `read` | User has read the notification |
| `failed` | Delivery failed |

### 1.11 Import Batch Status

| Value | Description |
|---|---|
| `pending` | Import uploaded, not yet processed |
| `dry_run` | Dry run completed (preview mode) |
| `imported` | Import committed to database |
| `reversed` | Import reversed within reversal window |

### 1.12 DSAR Request Type (P1)

| Value | Description |
|---|---|
| `access` | Data subject requests copy of their data |
| `correction` | Data subject requests correction of their data |
| `erasure` | Data subject requests deletion of their data |

### 1.13 Consent Purpose

| Value | Description |
|---|---|
| `processing_kyc` | Processing KYC documents for loan application |
| `sharing_with_lenders` | Sharing information with lender partners |
| `contacting_customer` | Contacting customer for follow-ups |

---

## 2. Field Type Constraints

### 2.1 Identifiers

| Field | Format | Validation Rule |
|---|---|---|
| PAN | `AAAAA0000A` (5 alpha + 4 digit + 1 alpha) | Regex: `^[A-Z]{5}[0-9]{4}[A-Z]$` |
| Aadhaar | Last 4 digits only | Regex: `^[0-9]{4}$` (full number NEVER stored) |
| Mobile (India) | 10 digits, no country code stored separately | Regex: `^[6-9][0-9]{9}$` |
| GSTIN | 15 alphanumeric | Regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$` |
| Vehicle Registration (India) | `XX-00-XX-0000` format | Regex: `^[A-Z]{2}-[0-9]{2}-[A-Z]{1,3}-[0-9]{1,4}$` |
| Case Number | Auto-generated per org | Format: `{org_prefix}-{YYMMDD}-{sequence}` |
| UUID (all PKs) | UUID v7 | Time-sortable, 128-bit |

### 2.2 Money Fields

| Type | PostgreSQL Type | Constraints |
|---|---|---|
| All currency amounts | `NUMERIC(14,2)` | Non-negative where contextually required |
| Percentage rates | `NUMERIC(6,4)` | 0.0000 to 100.0000 |
| Interest rates | `NUMERIC(5,2)` | 0.00 to 99.99 |

### 2.3 Temporal Fields

| Type | PostgreSQL Type | Display Format |
|---|---|---|
| All timestamps | `TIMESTAMPTZ` | Stored UTC, displayed IST (`Asia/Kolkata`) |
| All dates (no time) | `DATE` | `dd MMM yyyy` (e.g., `24 Oct 2024`) |
| SLA durations | Computed from `entered_stage_at` | Hours, displayed as days |

### 2.4 Text Fields

| Field | Max Length | Validation |
|---|---|---|
| Person name | 255 chars | Non-empty, trimmed |
| Organization name | 255 chars | Non-empty, trimmed |
| Org slug | 100 chars | Lowercase alphanumeric + hyphens |
| Email | 255 chars | RFC 5322 validation |
| Notes / text fields | 65,535 chars | Trimmed, no executable content |
| File name (sanitized) | 255 chars | Alphanumeric + dots + hyphens + underscores only |

---

## 3. Product Types

| Value | Description |
|---|---|
| `new_car` | New car purchase loan |
| `used_car` | Used/pre-owned car loan |
| `two_wheeler` | Two-wheeler purchase loan |
| `commercial_vehicle` | Commercial vehicle loan |
| `tractor` | Tractor/agricultural vehicle loan |
| `ev` | Electric vehicle loan |
| `refinance` | Loan refinancing |

---

## 4. Source Types

| Value | Description |
|---|---|
| `dealer` | Vehicle dealer |
| `sub_dsa` | Sub-DSA or connector |
| `connector` | Independent connector |
| `employee` | Internal employee referral |
| `direct` | Direct customer walk-in |
| `walk_in` | Walk-in customer |

---

## 5. Lender Types

| Value | Description |
|---|---|
| `bank` | Scheduled commercial bank |
| `nbfc` | Non-banking financial company |
| `sfb` | Small finance bank |
| `hfc` | Housing finance company |

---

## 6. Employment Types

| Value | Description |
|---|---|
| `salaried` | Salaried employee |
| `self_employed` | Self-employed individual |
| `business` | Business owner |
| `professional` | Licensed professional (doctor, CA, etc.) |
| `agriculture` | Agricultural income |

---

## 7. Party Roles (in a Case)

| Value | Description |
|---|---|
| `applicant` | Primary loan applicant (at least one required per case) |
| `co_applicant` | Co-applicant for the loan |
| `guarantor` | Loan guarantor |
| `seller` | Vehicle seller |

---

## 8. Vehicle Condition

| Value | Description |
|---|---|
| `new` | Brand new vehicle from dealership |
| `used` | Pre-owned / second-hand vehicle |

---

## 9. Fuel Types

| Value | Description |
|---|---|
| `petrol` | Petrol engine |
| `diesel` | Diesel engine |
| `cng` | CNG powered |
| `electric` | Electric vehicle |
| `hybrid` | Hybrid (petrol + electric) |

---

## 10. Payout Rule Basis

| Value | Description | Required Fields |
|---|---|---|
| `percent` | Percentage of disbursed amount | `rate_percent` |
| `flat` | Fixed flat amount | `flat_amount` |
| `slab` | Slab-based rates by ticket size | `slabs` (JSONB array) |

---

## 11. Consent Channels

| Value | Description |
|---|---|
| `in_person` | Consent obtained face-to-face |
| `digital` | Consent obtained via digital form |
| `phone` | Consent obtained via phone call |

---

## 12. Audit Action Types

| Action | Entity | Description |
|---|---|---|
| `auth.login_success` | user | Successful login |
| `auth.login_failure` | user | Failed login attempt |
| `auth.lockout` | user | Account locked after failed attempts |
| `auth.logout` | user | User logged out |
| `auth.token_refresh` | user | Token refreshed |
| `auth.version_increment` | user | auth_version incremented (deactivation/role change) |
| `case.created` | case | New case created |
| `case.status_changed` | case | Case status transition |
| `case.updated` | case | Case details modified |
| `case.deleted` | case | Case soft-deleted |
| `document.uploaded` | document | Document uploaded to quarantine |
| `document.validated` | document | Document passed quarantine validation |
| `document.validation_failed` | document | Document failed quarantine validation |
| `document.viewed` | document | Document viewed/downloaded |
| `document.verified` | document | Document verified by staff |
| `document.rejected` | document | Document rejected by staff |
| `document.archived` | document | Document archived |
| `party.created` | party | New party created |
| `party.updated` | party | Party details modified |
| `party.field_revealed` | party | Masked field revealed |
| `party.deleted` | party | Party soft-deleted |
| `lender_app.created` | lender_application | New lender application created |
| `lender_app.status_changed` | lender_application | Application status transition |
| `lender_app.winning_set` | lender_application | Application marked as winning |
| `payout.rule_created` | payout_rule | New payout rule created |
| `payout.expectation_created` | payout_expectation | Payout expectation auto-created |
| `payout.expectation_overridden` | payout_expectation | Manual override of expected payout |
| `payout.receipt_imported` | payout_receipt | Payout receipt imported |
| `payout.reconciled` | reconciliation | Payout reconciled |
| `payout.clawback_created` | clawback_event | Clawback event recorded |
| `export.data_exported` | — | Data exported to CSV/Excel |
| `import.batch_imported` | import_batch | Data import committed |
| `import.batch_reversed` | import_batch | Data import reversed |
| `consent.captured` | consent_record | Consent recorded |
| `consent.withdrawn` | consent_record | Consent withdrawn |
| `user.created` | user | New user created |
| `user.deactivated` | user | User deactivated |
| `user.role_changed` | user | User role changed |

---

## 13. File Upload Constraints

| Constraint | Value |
|---|---|
| Allowed MIME types | `application/pdf`, `image/jpeg`, `image/png` |
| Max file size | 15 MB (configurable per org) |
| Validation method | Magic byte inspection (not extension-based) |
| EXIF stripping | Required for all image uploads |
| Filename sanitization | Alphanumeric, dots, hyphens, underscores only; max 255 chars |
| Quarantine TTL | 24 hours (abandoned uploads cleaned) |

---

## 14. Display Format Standards

| Data Type | Format | Example |
|---|---|---|
| Currency (exact) | `₹{amount}` with Indian grouping, 2 decimals | `₹12,50,000.00` |
| Currency (summary) | `₹{amount}L` / `₹{amount}Cr` | `₹6.5L`, `₹14.30 Cr` |
| Date | `dd MMM yyyy` | `24 Oct 2024` |
| Relative time | `{n}m ago`, `{n}h ago`, `{n}d ago` | `12m ago`, `2h ago` |
| Timestamp | `dd MMM yyyy, HH:mm IST` | `24 Oct 2024, 14:00 IST` |
| Percentage | `{n.n}%` (one decimal) | `82.4%` |
| Phone (masked) | `XXXXX-XX{last3}` | `XXXXX-XX890` |
| PAN (masked) | `XXXX-XXXX-{last4}` | `XXXX-XXXX-1234` |
| Duration | `{n.n} Days` or `{n}d Stuck` | `4.2 Days` |
