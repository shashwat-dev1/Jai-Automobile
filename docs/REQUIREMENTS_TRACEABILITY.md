# DSA OS — Requirements Traceability Matrix

> Source of truth: `DSA_OS_PRD_v1.0.docx` and `DSA_OS_SRS_v1.0.docx`
>
> This document maps every PRD feature to SRS requirements, assigns implementation phases, and defines verification methods.

---

## Legend

| Column | Meaning |
|---|---|
| **Req ID** | SRS requirement identifier |
| **Source** | PRD feature or SRS section |
| **Requirement** | Verbatim or faithful summary from PRD/SRS |
| **Priority** | P0 = pilot MVP, P1 = pilot hardening, P2 = later phase |
| **Phase** | Implementation phase (PH-00 through PH-10) |
| **Verification** | T = test, D = demonstration, I = inspection, A = analysis |

---

## 1. Authentication and Access Control (AUTH)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-AUTH-001 | F-14, SRS 3.2.1 | Authenticate users by mobile or email and password; issue short-lived access tokens with refresh | P0 | PH-01 | T |
| FR-AUTH-002 | F-14, SRS 3.2.1 | Enforce roles per permission matrix (Appendix B) on every API call; return 403 when denied | P0 | PH-01 | T |
| FR-AUTH-003 | F-14, SRS 3.2.1 | Lock account for 15 minutes after 5 failed logins; log event | P0 | PH-01 | T |
| FR-AUTH-004 | F-14, SRS 3.2.1 | Support TOTP two-factor authentication; mandatory for Owner and Accountant from P1 | P1 | PH-10 | T |
| FR-AUTH-005 | F-14, SRS 3.2.1 | Owner can create, deactivate and re-role users; deactivation ends all sessions immediately | P0 | PH-01 | T |
| FR-AUTH-006 | F-14, SRS 3.2.1 | Sessions expire after inactivity (default 30 min, configurable); preserve unsaved form data locally | P0 | PH-01 | T |

## 2. Parties and Duplicates (PTY)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-PTY-001 | F-01, SRS 3.2.2 | Create a party with name, mobile, employment type and address; unique ID scoped to organization | P0 | PH-02 | T |
| FR-PTY-002 | F-01, SRS 3.2.2 | Warn when existing party in organization has same mobile or PAN last four with name similarity | P0 | PH-02 | T |
| FR-PTY-003 | F-01, SRS 3.2.2 | Search parties by name, mobile, PAN last four, case number and vehicle number | P0 | PH-02 | T |
| FR-PTY-004 | F-15, SRS 3.2.2 | PAN stored encrypted; Aadhaar stored masked only (last four digits) | P0 | PH-02 | I |
| FR-PTY-005 | F-01, SRS 3.2.2 | Each party carries a role per case: applicant, co-applicant, guarantor or seller | P0 | PH-02 | T |

## 3. Cases (CAS)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-CAS-001 | F-02, SRS 3.2.3 | Create case linked to at least one applicant, one source, one owner and a product type | P0 | PH-02 | T |
| FR-CAS-002 | F-02, SRS 3.2.3 | Generate unique case number per organization | P0 | PH-02 | T |
| FR-CAS-003 | F-02, SRS 3.2.3 | Case detail shows chronological timeline of status changes, documents, lender events, follow-ups and payout events | P0 | PH-02 | D |
| FR-CAS-004 | F-02, SRS 3.2.3 | List and filter cases by status, lender, product, source, owner, age and stuck flag | P0 | PH-02 | T |
| FR-CAS-005 | F-01, SRS 3.2.3 | Warn on likely duplicate cases by vehicle number or applicant and active status | P0 | PH-02 | T |
| FR-CAS-006 | F-02, SRS 3.2.3 | Concurrent edits detected with version column; second save rejected with conflict message | P0 | PH-02 | T |

## 4. Vehicles (VEH)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-VEH-001 | F-03, SRS 3.2.4 | Case holds vehicle with condition, registration number, make, model, variant, year, chassis/engine numbers, owner serial, fuel, price fields | P0 | PH-02 | T |
| FR-VEH-002 | F-03, SRS 3.2.4 | Validate registration number format; reject invalid values | P0 | PH-02 | T |
| FR-VEH-003 | F-03, SRS 3.2.4 | Record valuation amount, source, date; existing hypothecation (lender, status, source, date) | P0 | PH-02 | T |
| FR-VEH-004 | F-03, SRS 3.2.4 | Link-out helper to verify vehicle details on official portal; no automated lookup in release 1 | P0 | PH-02 | I |
| FR-VEH-005 | F-04, SRS 3.2.4 | Active hypothecation recorded -> checklist adds seller loan closure documents (NOC and Form 35) | P0 | PH-03 | T |

## 5. Document Checklist and Hub (DOC)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-DOC-001 | F-04, SRS 3.2.5 | Generate required-document list from rules combining product, employment type, vehicle condition and lender; recalculate on change | P0 | PH-03 | T |
| FR-DOC-002 | F-04, SRS 3.2.5 | Accept PDF, JPG, PNG up to 15 MB (configurable); reject other types; scan for malware before storage | P0 | PH-03 | T |
| FR-DOC-003 | F-04, SRS 3.2.5 | Document statuses: Requested, Received, Under Review, Verified, Rejected, Expired, Archived; reason on rejection | P0 | PH-03 | T |
| FR-DOC-004 | F-04, SRS 3.2.5 | Set Expired automatically when document-type validity exceeded | P0 | PH-03 | T |
| FR-DOC-005 | F-04, SRS 3.2.5 | Replacing a document creates new version; earlier versions retained and recoverable by Owner | P0 | PH-03 | T |
| FR-DOC-006 | F-04, SRS 3.2.5 | No hard-delete by users; deletion means archive; hard delete only through retention workflow | P0 | PH-03 | T |
| FR-DOC-007 | F-04, SRS 3.2.5 | Generate copyable request message listing missing documents | P0 | PH-03 | D |
| FR-DOC-008 | F-14, SRS 3.2.5 | Downloads via signed URLs valid at most 5 minutes; every view/download audit-logged | P0 | PH-03 | T |
| FR-DOC-009 | F-04, SRS 3.2.5 | Merge images into single PDF on request | P1 | PH-10 | T |
| FR-DOC-010 | F-04, SRS 3.2.5 | Link-based customer upload with consent notice after legal review | P1 | PH-10 | D |

## 6. Lender Applications (LAP)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-LAP-001 | F-05, SRS 3.2.6 | Case supports one or more lender applications with lender, product, login reference, login date, status | P0 | PH-04 | T |
| FR-LAP-002 | F-05, SRS 3.2.6 | Record queries, sanction terms (amount, tenure, rate, margin money, date), rejection reason code, disbursal date/amount/reference | P0 | PH-04 | T |
| FR-LAP-003 | F-05, SRS 3.2.6 | Display lender applications of a case side by side | P0 | PH-04 | D |
| FR-LAP-004 | F-05, SRS 3.2.6 | Rejected application requires a rejection reason code (BR-04) | P0 | PH-04 | T |
| FR-LAP-005 | F-05, SRS 3.2.6 | At most one application per case is winning, only when Disbursed (BR-05) | P0 | PH-04 | T |
| FR-LAP-006 | F-05, SRS 3.2.6 | Disbursed amount may not exceed sanctioned amount without recorded override (BR-08) | P0 | PH-04 | T |

## 7. Workflow, SLA and Follow-ups (WFL)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-WFL-001 | F-06, SRS 3.2.7 | Enforce allowed status transitions (Appendix C); return 409 with allowed next states otherwise | P0 | PH-04 | T |
| FR-WFL-002 | F-06, SRS 3.2.7 | Statuses and SLAs configurable per organization without code changes | P0 | PH-04 | T |
| FR-WFL-003 | F-06, SRS 3.2.7 | Every status change stores from-status, to-status, user, timestamp and note | P0 | PH-04 | T |
| FR-WFL-004 | F-06, SRS 3.2.7 | Compute ageing as now minus entered_stage_at; flag Stuck when ageing exceeds stage SLA | P0 | PH-04 | T |
| FR-WFL-005 | F-06, SRS 3.2.7 | Users set next action, owner and due date on a case or lender application | P0 | PH-04 | T |
| FR-WFL-006 | F-06, SRS 3.2.7 | Moving to Applied blocked while mandatory docs missing; Manager override with reason (BR-03) | P0 | PH-04 | T |
| FR-WFL-007 | F-07, SRS 3.2.7 | PDD board with items by lender application, due date, owner, status, ageing buckets (0-7, 8-15, 16-30, 30+) | P0 | PH-05 | D |
| FR-WFL-008 | F-07, SRS 3.2.7 | Track RC with hypothecation endorsement, insurance with lender clause, Form 34 receipt as PDD item types | P0 | PH-05 | T |

## 8. Sources, Partners and Splits (SRC)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-SRC-001 | F-08, SRS 3.2.8 | Maintain sources: dealer, sub-DSA, connector, employee, direct, walk-in; with contact and parent | P0 | PH-02 | T |
| FR-SRC-002 | F-08, SRS 3.2.8 | Every case has exactly one primary source (BR-02) | P0 | PH-02 | T |
| FR-SRC-003 | F-11, SRS 3.2.8 | Split rules per source or case (percentage or flat) with beneficiaries; total at most 100% net payout (BR-09) | P1 | PH-06 | T |
| FR-SRC-004 | F-12, SRS 3.2.8 | Report source-wise cases, approval rate, disbursal conversion, average ticket and payout | P0 | PH-08 | T |

## 9. Payout, Clawback and Reconciliation (PAY)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-PAY-001 | F-09, SRS 3.2.9 | Store payout rules with lender, product, effective dates, basis (percent/flat/slab), slabs, conditions, gating, clawback days, TDS, GST mode | P0 | PH-06 | T |
| FR-PAY-002 | F-09, SRS 3.2.9 | On disbursal, select rule in force on disbursal date, store snapshot, compute expected gross and net payout (BR-06, BR-13) | P0 | PH-06 | T |
| FR-PAY-003 | F-09, SRS 3.2.9 | No rule match: expectation flagged No rule, listed on attention list, never computed as zero | P0 | PH-06 | T |
| FR-PAY-004 | F-09, SRS 3.2.9 | Rule has gating condition: expectation stays Held until satisfied (BR-10) | P0 | PH-06 | T |
| FR-PAY-005 | F-09, SRS 3.2.9 | Manual overrides of expectation require reason and are audited | P0 | PH-06 | T |
| FR-PAY-006 | F-10, SRS 3.2.9 | Record TDS per receipt; reconcile with Form 26AS/AIS data entered by accountant | P1 | PH-07 | T |
| FR-PAY-007 | F-10, SRS 3.2.9 | Record payout receipts only against disbursed cases (BR-07) | P0 | PH-07 | T |
| FR-PAY-008 | F-10, SRS 3.2.9 | Import lender statements (CSV/Excel) with dry run, saved column mapping, error file for invalid rows | P1 | PH-07 | T |
| FR-PAY-009 | F-10, SRS 3.2.9 | Match statement lines to expectations by loan account number, customer, amount; classify Matched/Short/Excess/Missing/Clawed back/Unmatched | P0 | PH-07 | T |
| FR-PAY-010 | F-10, SRS 3.2.9 | Variance above configurable tolerance on per-lender outstanding report with ageing | P0 | PH-07 | T |
| FR-PAY-011 | F-11, SRS 3.2.9 | Track clawback window per lender application; record clawback events with amount and reason | P1 | PH-07 | T |
| FR-PAY-012 | F-10, SRS 3.2.9 | Manual reconciliation entry when no statement file exists | P0 | PH-07 | T |

## 10. Dashboards and Reports (RPT)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-RPT-001 | F-12, SRS 3.2.10 | Dashboard: pipeline by status, docs pending, stuck cases, PDD ageing, lender-wise conversion, expected vs received vs outstanding payout; date-range filters | P0 | PH-08 | D |
| FR-RPT-002 | F-12, SRS 3.2.10 | KPIs use formulas from PRD Section 9.1 | P0 | PH-08 | I |
| FR-RPT-003 | F-12, SRS 3.2.10 | Dashboard figures change when underlying data changes without manual refresh beyond page reload | P0 | PH-08 | T |
| FR-RPT-004 | F-12, SRS 3.2.10 | Reports filterable by date, lender, product, source, owner, status | P1 | PH-08 | T |
| FR-RPT-005 | F-16, SRS 3.2.10 | CSV and Excel export permission-controlled and audit-logged | P1 | PH-08 | T |
| FR-RPT-006 | F-14, SRS 3.2.10 | Field executive role sees only own performance | P0 | PH-08 | T |

## 11. Notifications (NTF)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-NTF-001 | F-13, SRS 3.2.11 | Generate notifications for: doc missing/expiring, follow-up due/overdue, case stuck, status change, lender query, sanction, disbursal, PDD due/overdue, payout held, short/missing, clawback window ending | P0 | PH-09 | T |
| FR-NTF-002 | F-13, SRS 3.2.11 | Deliver in-app (P0) and email (P1) through channel abstraction allowing SMS and WhatsApp later | P0 | PH-09 | T |
| FR-NTF-003 | F-13, SRS 3.2.11 | User preferences, daily digest, quiet hours; duplicate suppression | P1 | PH-09 | T |
| FR-NTF-004 | F-13, SRS 3.2.11 | Delivery log per notification | P1 | PH-09 | I |
| FR-NTF-005 | F-13, SRS 3.2.11 | Customer-facing notifications not sent without recorded consent and legal review | P2 | — | I |

## 12. Consent and Privacy (PRV)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-PRV-001 | F-15, SRS 3.2.12 | Record consent per party and purpose with notice version, channel, timestamp, capturing user | P0 | PH-02 | T |
| FR-PRV-002 | F-15, SRS 3.2.12 | Case without consent for its purposes flagged Consent missing | P0 | PH-02 | T |
| FR-PRV-003 | F-15, SRS 3.2.12 | Support consent withdrawal and data-subject request log (access, correction, erasure) with due dates | P1 | PH-10 | T |
| FR-PRV-004 | F-15, SRS 3.2.12 | Configurable retention schedule; flag records due for deletion; delete through audited workflow; legal-hold override | P1 | PH-10 | T |
| FR-PRV-005 | F-15, SRS 3.2.12 | Personal-data breach register and incident runbook; initial triage within 24 hours | P1 | PH-10 | I |

## 13. Audit (AUD)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-AUD-001 | F-14, SRS 3.2.13 | Log events per Appendix D: actor, role, action, entity, time (UTC), old/new values (sensitive redacted/hashed), IP, device | P0 | PH-01 | T |
| FR-AUD-002 | F-14, SRS 3.2.13 | Audit records append-only for application roles; modification attempts fail and are logged | P0 | PH-01 | T |
| FR-AUD-003 | F-14, SRS 3.2.13 | Owner and Auditor can search and export audit log by user, entity, action, date | P0 | PH-01 | T |

## 14. Data Import and Export (IMP)

| Req ID | Source | Requirement | Priority | Phase | Verification |
|---|---|---|---|---|---|
| FR-IMP-001 | F-16, SRS 3.2.14 | Import parties, cases, sources and lenders from Excel or CSV with dry-run validation report | P1 | PH-10 | T |
| FR-IMP-002 | F-16, SRS 3.2.14 | Valid rows importable; invalid rows exported with error messages | P1 | PH-10 | T |
| FR-IMP-003 | F-16, SRS 3.2.14 | Imports tenant-scoped, audited and reversible within 24 hours | P1 | PH-10 | T |

## 15. Local OCR Engine (OCR)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification | Rationale |
|---|---|---|---|---|---|---|---|
| FR-OCR-001 | F-17, SRS 3.2.15 | System should extract suggested fields from KYC/RC images using locally hosted OCR | P2 | `PLANNED / POST-MVP` | Post-MVP | T | Release 1 focuses on core case lifecycle and secure document quarantine. Automated background OCR field extraction is deferred to Release 2. |
| FR-OCR-002 | F-17, SRS 3.2.15 | Extracted values shall be suggestions requiring human confirmation before saving | P2 | `PLANNED / POST-MVP` | Post-MVP | T | Human-in-the-loop review workflow for OCR suggestions will be implemented alongside FR-OCR-001 in Release 2. |
| FR-OCR-003 | F-17, SRS 3.2.15 | System should flag name and address mismatches across documents | P2 | `PLANNED / POST-MVP` | Post-MVP | T | Cross-document inconsistency flagging depends on the local OCR extraction pipeline in Release 2. |
| FR-OCR-004 | F-17, SRS 3.2.15 | No document or extracted data shall leave approved environment | P2 | `ARCHITECTURE CONSTRAINT` | PH-03, PH-10 | I | Mandatory privacy constraint: customer documents must never be routed to external cloud AI/OCR services. Architecture enforces local private MinIO/worker processing only. |

## 16. User Interface and Integration Requirements (IF)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification | Rationale |
|---|---|---|---|---|---|---|---|
| IF-1 | SRS 3.1.1 | UI responsive and usable at 360 px width and above | P0 | `MVP / RELEASE 1` | PH-02+ | D | Mobile responsiveness is required for field executives capturing leads on Android handsets. |
| IF-2 | SRS 3.1.1 | Case creation requires no more than six mandatory fields | P0 | `MVP / RELEASE 1` | PH-02 | I | Core usability requirement for field case capture under 3 minutes. |
| IF-3 | SRS 3.1.1 | Today view listing overdue, due-today and stuck items | P0 | `MVP / RELEASE 1` | PH-08 | D | Central operational dashboard view for daily executive task management. |
| IF-4 | SRS 3.1.1 | Support English; Hindi labels in P1 | P1 | `PLANNED / POST-MVP` | PH-10 | I | English UI in MVP; Hindi localization dictionary implemented in hardening/P1 phase. |
| IF-5 | SRS 3.1.1 | Money values shown in INR with Indian digit grouping | P0 | `MVP / RELEASE 1` | PH-02+ | I | Universal financial formatting rule (`₹12,50,000`) across all ledger views and cards. |
| IF-6 | SRS 3.1.1 | WCAG 2.1 AA for contrast and keyboard on core screens | P1 | `MVP / RELEASE 1` | PH-10 | A | Accessibility audit on high-contrast Graphite Ledger theme. |
| IF-7 | SRS 3.1.2 | REST/JSON API described by OpenAPI 3 under /api/v1 | P0 | `MVP / RELEASE 1` | PH-00 | I | FastAPI auto-generates OpenAPI 3 spec at `/api/v1/openapi.json`. |
| IF-8 | SRS 3.1.2 | CSV and Excel import and export with column mapping saved per lender | P1 | `MVP / RELEASE 1` | PH-07, PH-10 | T | Required for reconciliation statement processing and pipeline reporting. |
| IF-9 | SRS 3.1.2 | Email delivery through SMTP or transactional provider | P0 | `MVP / RELEASE 1` | PH-09 | T | Background notification worker delivers transactional status updates and password resets. |
| IF-10 | SRS 3.1.2 | WhatsApp Business API, authorised vehicle-data provider, accounting export; pluggable adapters | P2 | `DEFERRED` | Post-MVP | I | Direct 3rd-party SaaS integrations are deferred to Release 2. Architecture defines clean interface adapters so they can be plugged in without refactoring. |
| IF-11 | SRS 3.1.2 | Mobile camera and file picker for document capture through browser | P0 | `MVP / RELEASE 1` | PH-03 | D | HTML5 camera capture allows field executives to snap photos directly into the document quarantine pipeline. |
| IF-12 | SRS 3.1.2 | All client-server traffic over TLS 1.2 or later | P0 | `ARCHITECTURE CONSTRAINT` | PH-00, PH-10 | I | Enforced by Nginx reverse proxy configuration; HTTP automatically redirected to HTTPS with modern TLS cipher suites. |

## 17. Non-Functional: Performance (PRF)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification |
|---|---|---|---|---|---|---|
| NFR-PRF-001 | F-12, SRS 3.3 | List/search responses at most 1.5 s at P95 with 20,000 cases per tenant under 50 concurrent users | P0 | `MVP / RELEASE 1` | PH-10 | T |
| NFR-PRF-002 | F-12, SRS 3.3 | Dashboard responses at most 3 s at P95 on same load | P0 | `MVP / RELEASE 1` | PH-10 | T |
| NFR-PRF-003 | F-04, SRS 3.3 | Document upload shows progress, resume/retry on connection loss | P0 | `MVP / RELEASE 1` | PH-03 | T |
| NFR-PRF-004 | F-10, SRS 3.3 | Statement import of 5,000 lines at most 60 s | P1 | `MVP / RELEASE 1` | PH-10 | T |

## 18. Non-Functional: Security (SEC)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification |
|---|---|---|---|---|---|---|
| NFR-SEC-001 | F-14, SRS 3.6.1 | All traffic TLS 1.2+; HSTS enabled | P0 | `ARCHITECTURE CONSTRAINT` | PH-00 | I |
| NFR-SEC-002 | F-14, SRS 3.6.1 | Tenant isolation via application code + PostgreSQL RLS; automated tests prove no cross-tenant access | P0 | `MVP / RELEASE 1` | PH-01 | T |
| NFR-SEC-003 | F-14, SRS 3.6.1 | Passwords hashed with Argon2id; secrets in managed secret store | P0 | `MVP / RELEASE 1` | PH-01 | I |
| NFR-SEC-004 | F-15, SRS 3.6.1 | Data at rest encrypted; PAN and bank details use field-level encryption | P0 | `MVP / RELEASE 1` | PH-01 | I |
| NFR-SEC-005 | F-14, SRS 3.6.1 | Object storage private; documents via signed URLs at most 5 min | P0 | `ARCHITECTURE CONSTRAINT` | PH-03 | T |
| NFR-SEC-006 | F-14, SRS 3.6.1 | Rate limiting, input validation, output encoding, CSRF/XSS protections (OWASP ASVS L2) | P0 | `MVP / RELEASE 1` | PH-01 | T |
| NFR-SEC-007 | F-14, SRS 3.6.1 | Uploaded images: EXIF metadata stripped, filenames sanitized | P0 | `MVP / RELEASE 1` | PH-03 | T |
| NFR-SEC-008 | F-14, SRS 3.6.1 | Masked fields reveal only to permitted roles; each reveal audited | P0 | `MVP / RELEASE 1` | PH-02 | T |
| NFR-SEC-009 | F-14, SRS 3.6.1 | Third-party penetration test before real customer data | P1 | `MVP / RELEASE 1` | PH-10 | A |
| NFR-SEC-010 | F-14, SRS 3.6.1 | Downloads carry visible watermark with user and time | P1 | `MVP / RELEASE 1` | PH-10 | D |

## 19. Non-Functional: Privacy (PRV)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification |
|---|---|---|---|---|---|---|
| NFR-PRV-001 | F-15, SRS 3.6.2 | Personal data processed only for recorded purposes with recorded consent | P0 | `MVP / RELEASE 1` | PH-02 | I |
| NFR-PRV-002 | F-15, SRS 3.6.2 | Collected data limited to fields needed for case; optional fields marked | P0 | `MVP / RELEASE 1` | PH-02 | I |
| NFR-PRV-003 | F-15, SRS 3.6.2 | Hosting in India region unless customer approves otherwise in writing | P0 | `ARCHITECTURE CONSTRAINT` | PH-00 | I |
| NFR-PRV-004 | F-15, SRS 3.6.2 | Customer documents and extracted data not sent to public AI/OCR services | P0 | `ARCHITECTURE CONSTRAINT` | PH-03 | I |
| NFR-PRV-005 | F-15, SRS 3.6.2 | Sub-processors listed and bound by written data-processing terms | P0 | `MVP / RELEASE 1` | PH-10 | I |

## 20. Non-Functional: Usability (USA)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification | Rationale |
|---|---|---|---|---|---|---|---|
| NFR-USA-001 | SRS 3.5 | New field executive shall be able to create case with document in under 3 minutes after 10-minute introduction | P0 | `MVP / RELEASE 1` | PH-02, PH-03 | D | Validates low field friction; requires streamlined 6-field mobile intake and camera capture. |
| NFR-USA-002 | SRS 3.5 | Error messages shall state cause and corrective action | P0 | `MVP / RELEASE 1` | PH-00, PH-01+ | I | Clear actionable user error envelopes `{code, message, action}` preventing user confusion. |

## 21. Non-Functional: Maintainability (MNT)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification | Rationale |
|---|---|---|---|---|---|---|---|
| NFR-MNT-001 | SRS 3.6.4 | Typed API schemas, migrations, linting and CI on every push | P0 | `MVP / RELEASE 1` | PH-00 | I | Pydantic v2 schemas, TypeScript contracts, Alembic migrations, ruff, ESLint, GitHub Actions CI. |
| NFR-MNT-002 | SRS 3.6.4 | Automated tests cover payout engine, checklist engine, state transitions, RBAC, tenant isolation (>=80% line coverage) | P0 | `MVP / RELEASE 1` | PH-01..07, PH-10 | T | Unit, integration, and RLS security test suites with pytest coverage gates. |

## 22. Non-Functional: Portability (POR)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification | Rationale |
|---|---|---|---|---|---|---|---|
| NFR-POR-001 | SRS 3.6.5 | System shall be containerised and deployable in DSA-controlled infrastructure | P1 | `MVP / RELEASE 1` | PH-00, PH-10 | D | Docker Compose orchestration for self-hosted containerized deployment ensuring data sovereignty. |

## 23. Non-Functional: Reliability (REL)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification |
|---|---|---|---|---|---|---|
| NFR-REL-001 | SRS 3.6.3 | Automated daily backups; restore tested monthly; RPO at most 24 h, RTO at most 8 h for pilot | P0 | `MVP / RELEASE 1` | PH-10 | T |
| NFR-REL-002 | SRS 3.6.3 | Transactions prevent partial writes; failures return clear errors and alert operators | P0 | `MVP / RELEASE 1` | PH-00 | T |
| NFR-REL-003 | SRS 3.6.3 | Target 99.5% monthly availability during business hours for pilot | P1 | `MVP / RELEASE 1` | PH-10 | A |
| NFR-REL-004 | SRS 3.6.3 | Basic monitoring and alerting (errors, latency, queue depth, storage, backup status) | P0 | `MVP / RELEASE 1` | PH-10 | I |

## 24. Legal and Regulatory (LEG)

| Req ID | Source | Requirement | Priority | Scope Assignment | Phase | Verification |
|---|---|---|---|---|---|---|
| LEG-001 | SRS 3.7 | Processing aligns with DPDP Act 2023 and Rules 2025 core duties | P0 | `ARCHITECTURE CONSTRAINT` | PH-02 | A |
| LEG-002 | SRS 3.7 | Release 1 shall not display loan offers or perform lending functions for customers | P0 | `ARCHITECTURE CONSTRAINT` | PH-00 | I |
| LEG-003 | SRS 3.7 | TDS recorded under section 393(1) at configured rate/threshold; GST mode configurable per DSA | P1 | `MVP / RELEASE 1` | PH-06 | A |
| LEG-004 | SRS 3.7 | Retention periods set with DSA's advisers; none assumed | P1 | `MVP / RELEASE 1` | PH-10 | A |
| LEG-005 | SRS 3.7 | Aadhaar stored masked only unless legally authorised otherwise | P0 | `ARCHITECTURE CONSTRAINT` | PH-02 | I |

## 25. Business Rules (BR)

| Req ID | Source | Rule | Verified By |
|---|---|---|---|
| BR-01 | SRS App A | Every business record carries org_id; no cross-org reads or writes | NFR-SEC-002 |
| BR-02 | SRS App A | Case has one owner, one primary source, at least one applicant | FR-CAS-001, FR-SRC-002 |
| BR-03 | SRS App A | Case cannot move to Applied while mandatory docs missing; Manager override with reason | FR-WFL-006 |
| BR-04 | SRS App A | Rejected lender application requires rejection reason code | FR-LAP-004 |
| BR-05 | SRS App A | At most one lender application per case is winning; only Disbursed can be winning | FR-LAP-005 |
| BR-06 | SRS App A | Payout expectation created only when lender application is Disbursed; rule snapshot from disbursal date | FR-PAY-002 |
| BR-07 | SRS App A | Payout receipt only against a disbursed case; unmatched lines in unmatched queue | FR-PAY-007 |
| BR-08 | SRS App A | Disbursed amount may not exceed sanctioned amount without recorded override | FR-LAP-006 |
| BR-09 | SRS App A | Splits may not total more than 100% of net payout | FR-SRC-003 |
| BR-10 | SRS App A | Rule gating condition: expectation stays Held until met | FR-PAY-004 |
| BR-11 | SRS App A | Case Closed only when payout received or written off and clawback window elapsed or accepted risk | FR-PAY-011, FR-WFL-001 |
| BR-12 | SRS App A | Documents never hard-deleted by users; deletion = archive | FR-DOC-006 |
| BR-13 | SRS App A | Payout rule edits effective-dated; never alter existing snapshots | FR-PAY-001, FR-PAY-002 |
| BR-14 | SRS App A | Status changes follow allowed-transition table (Appendix C) | FR-WFL-001 |
