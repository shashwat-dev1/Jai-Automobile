# DSA OS — API Design

> All endpoints under `/api/v1`. Authentication: Bearer JWT unless noted.
> Responses follow a consistent envelope. Pagination uses cursor-based approach.

---

## 1. Common Patterns

### Response Envelope

```json
// Success
{ "data": { ... }, "meta": { "cursor": "...", "has_more": true } }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

### Pagination

All list endpoints accept: `?limit=25&after={cursor}&sort={field}&order=asc|desc`

### Filtering

Query parameters matching indexed fields. Example: `?status=lead&product=used_car&source_id={uuid}`

### Audit Events

All mutating endpoints emit audit events to the internal event bus. The audit event type is noted per endpoint.

---

## 2. Authentication (`/api/v1/auth`)

### POST `/auth/login`

| | |
|---|---|
| **Purpose** | Authenticate user, issue JWT pair |
| **Authentication** | None |
| **Authorization** | None |
| **Request** | `{ "email_or_mobile": "...", "password": "..." }` |
| **Response** | `{ "access_token": "...", "refresh_token": "...", "user": { id, name, role, org_id }, "expires_in": 900 }` |
| **Validation** | Non-empty credentials; account not locked |
| **Errors** | 401 Invalid credentials; 423 Account locked (with unlock_at); 429 Rate limited |
| **Audit** | `auth.login_success` or `auth.login_failed` |

### POST `/auth/refresh`

| | |
|---|---|
| **Purpose** | Rotate refresh token, issue new access token |
| **Authentication** | Refresh token in body |
| **Request** | `{ "refresh_token": "..." }` |
| **Response** | `{ "access_token": "...", "refresh_token": "...", "expires_in": 900 }` |
| **Errors** | 401 Invalid/expired/revoked refresh token |

### POST `/auth/logout`

| | |
|---|---|
| **Purpose** | Revoke current refresh token |
| **Authentication** | Bearer JWT |
| **Request** | `{ "refresh_token": "..." }` |
| **Response** | 204 No Content |
| **Audit** | `auth.logout` |

### GET `/auth/me`

| | |
|---|---|
| **Purpose** | Get current user profile and permissions |
| **Authentication** | Bearer JWT |
| **Response** | `{ id, name, email, mobile, role, permissions: [...], org: { id, name } }` |

---

## 3. Users (`/api/v1/users`)

### GET `/users`

| | |
|---|---|
| **Purpose** | List users in organization |
| **Authorization** | Owner |
| **Filtering** | `?role=processor&is_active=true&search=name` |
| **Pagination** | Cursor-based |
| **Audit** | None (read) |

### POST `/users`

| | |
|---|---|
| **Purpose** | Create a new user |
| **Authorization** | Owner |
| **Request** | `{ name, email, mobile, password, role, team }` |
| **Validation** | Email unique in org; mobile unique in org; valid role; password strength |
| **Errors** | 409 Duplicate email/mobile |
| **Audit** | `user.created` |

### PATCH `/users/{id}`

| | |
|---|---|
| **Purpose** | Update user profile or role |
| **Authorization** | Owner |
| **Request** | `{ name?, role?, team?, is_active? }` |
| **Validation** | Cannot deactivate self; valid role |
| **Side effects** | Deactivation revokes all sessions immediately |
| **Audit** | `user.updated` or `user.deactivated` |

---

## 4. Parties (`/api/v1/parties`)

### GET `/parties`

| | |
|---|---|
| **Purpose** | List/search parties |
| **Authorization** | Owner, Manager, Processor, Field Executive (own cases) |
| **Filtering** | `?search=name_or_mobile&pan_last_four=1234&case_id={uuid}` |
| **Pagination** | Cursor-based |

### POST `/parties`

| | |
|---|---|
| **Purpose** | Create a new party |
| **Authorization** | Owner, Manager, Processor, Field Executive |
| **Request** | `{ name, mobile_primary, employment_type, address_line, city, state, pincode, pan?, aadhaar_last_four?, date_of_birth?, email? }` |
| **Validation** | Mobile format; PAN format (if provided); pincode format |
| **Response** | `{ party, duplicate_warnings: [{ party_id, match_reason }] }` |
| **Audit** | `party.created` |
| **Notification** | None |

### GET `/parties/{id}`

| | |
|---|---|
| **Purpose** | Get party detail |
| **Authorization** | Owner, Manager, Processor, Field Executive (own cases), Auditor (read-only) |
| **Response** | Party with masked PAN, masked mobile for restricted roles |

### PATCH `/parties/{id}`

| | |
|---|---|
| **Purpose** | Update party |
| **Authorization** | Owner, Manager, Processor |
| **Audit** | `party.updated` |

### POST `/parties/{id}/reveal`

| | |
|---|---|
| **Purpose** | Reveal masked PAN or bank details |
| **Authorization** | Owner, Manager, Accountant |
| **Request** | `{ field: "pan" }` |
| **Response** | `{ value: "ABCPS8821K" }` |
| **Audit** | `party.field_revealed` (always) |

---

## 5. Cases (`/api/v1/cases`)

### GET `/cases`

| | |
|---|---|
| **Purpose** | List/filter cases |
| **Authorization** | All roles; Field Executive filtered to own cases |
| **Filtering** | `?status=lead&product=used_car&source_id={uuid}&owner_id={uuid}&lender_id={uuid}&stuck=true&search=case_no_or_name` |
| **Sorting** | `?sort=created_at&order=desc` or `?sort=entered_stage_at` |
| **Pagination** | Cursor-based |

### POST `/cases`

| | |
|---|---|
| **Purpose** | Create a new case |
| **Authorization** | Owner, Manager, Processor, Field Executive |
| **Request** | `{ product, requested_amount?, source_id, applicant_party_id, vehicle?: { condition, registration_no?, make?, model? } }` |
| **Validation** | Product valid; source exists; party exists; max 6 mandatory fields (IF-2) |
| **Response** | `{ case, duplicate_warnings: [{ case_id, match_reason }] }` |
| **Side effects** | Generate case_no; set status=lead; generate document checklist |
| **Audit** | `case.created` |

### GET `/cases/{id}`

| | |
|---|---|
| **Purpose** | Get case detail with timeline, parties, vehicle, documents, lender applications |
| **Authorization** | All roles; Field Executive only own; Auditor read-only |
| **Response** | Full case object with nested parties, vehicle, document summary, lender applications, status history, tasks |

### PATCH `/cases/{id}`

| | |
|---|---|
| **Purpose** | Update case fields |
| **Authorization** | Owner, Manager, Processor, Field Executive (own) |
| **Request** | `{ product?, requested_amount?, source_id?, owner_id?, next_action?, next_action_due?, version }` |
| **Validation** | Version matches (optimistic lock); valid field values |
| **Errors** | 409 Version conflict with current version returned |
| **Audit** | `case.updated` |

### POST `/cases/{id}/status`

| | |
|---|---|
| **Purpose** | Change case status |
| **Authorization** | Owner, Manager, Processor, Field Executive (limited) |
| **Request** | `{ to_status, note?, override_reason? }` |
| **Validation** | Transition allowed (FR-WFL-001); mandatory docs check for Applied (FR-WFL-006) |
| **Errors** | 409 Invalid transition with allowed states; 422 Missing mandatory documents |
| **Side effects** | Update entered_stage_at; create status_history; trigger notifications |
| **Audit** | `case.status_changed` |
| **Notification** | `status_change` to owner and watchers |

### GET `/cases/{id}/timeline`

| | |
|---|---|
| **Purpose** | Get chronological timeline of all events for a case |
| **Authorization** | Same as case detail |
| **Response** | Array of timeline events (status changes, documents, lender events, payout events, notes) |

### GET `/cases/ageing`

| | |
|---|---|
| **Purpose** | Get operational SLA pipeline ageing breakdown and stuck cases |
| **Authorization** | Owner, Manager, Processor |
| **Filtering** | `?product=&lender_id=&stuck_only=true&ageing_bucket=0-2|3-5|6+` |
| **Response** | `{ stuck_cases_count, summary_by_stage: [...], cases: [{ id, case_number, days_in_stage, sla_status, is_stuck }] }` |

---

## 6. Vehicles (`/api/v1/cases/{case_id}/vehicle`)

### GET `/cases/{case_id}/vehicle`

| | |
|---|---|
| **Purpose** | Get vehicle for a case |
| **Authorization** | Same as case |

### PUT `/cases/{case_id}/vehicle`

| | |
|---|---|
| **Purpose** | Create or update vehicle |
| **Authorization** | Owner, Manager, Processor, Field Executive (own) |
| **Request** | `{ condition, registration_no?, make?, model?, variant?, year?, chassis_no?, engine_no?, fuel_type?, owner_serial?, prices, valuation, existing_hypothecation? }` |
| **Validation** | Registration number format (FR-VEH-002) |
| **Side effects** | If hypothecation active, add closure docs to checklist (FR-VEH-005) |
| **Audit** | `vehicle.updated` |

---

## 7. Documents (`/api/v1/documents`)

### GET `/cases/{case_id}/checklist`

| | |
|---|---|
| **Purpose** | Get document checklist for a case |
| **Authorization** | Same as case |
| **Response** | Array of `{ document_type, is_mandatory, required_by_stage, status, document_id? }` |

### POST `/documents/upload-url`

| | |
|---|---|
| **Purpose** | Get pre-signed upload URL targeting the quarantine storage zone |
| **Authorization** | Owner, Manager, Processor, Field Executive (own cases) |
| **Request** | `{ case_id, document_type_code, file_name, file_size, mime_type }` |
| **Validation** | File type allowed (PDF, JPG, PNG); size <= 15 MB; case accessible |
| **Response** | `{ upload_url, upload_id, quarantine_key, expires_in: 300 }` |
| **Security** | Target path: `quarantine/{org_id}/{upload_id}/{sanitized_filename}`. Uploaded file is isolated from canonical store. |

### POST `/documents/confirm`

| | |
|---|---|
| **Purpose** | Confirm quarantine upload completed; triggers asynchronous validation & promotion worker pipeline |
| **Authorization** | Same as upload |
| **Request** | `{ upload_id }` |
| **Side effects** | Creates document record with status `quarantined`; enqueues ARQ job `validate_and_promote_document` (ClamAV malware scan, EXIF stripping, magic byte validation) |
| **Response** | `{ document_id, status: "quarantined" }` |
| **Audit** | `document.uploaded_to_quarantine` |

### GET `/documents/{id}/status`

| | |
|---|---|
| **Purpose** | Check scan and promotion status of an uploaded document |
| **Authorization** | Same as case |
| **Response** | `{ document_id, status: "quarantined" \| "scanning" \| "scan_failed" \| "received", scan_result?, error? }` |

### PATCH `/documents/{id}/status`

| | |
|---|---|
| **Purpose** | Change canonical document status (verify, reject, archive) |
| **Authorization** | Owner, Manager for archive; Owner, Manager, Processor for verify/reject |
| **Request** | `{ status, reject_reason? }` |
| **Validation** | Valid transition; document must be promoted (`received`); reason required on rejection |
| **Audit** | `document.status_changed` |

### GET `/documents/{id}/download`

| | |
|---|---|
| **Purpose** | Get signed download URL for canonical verified document |
| **Authorization** | Owner, Manager, Processor, Field Executive (own), Auditor (logged) |
| **Response** | `{ download_url, expires_in: 300 }` |
| **Security** | Strictly rejected with 400/403 if document status is `quarantined`, `scanning`, or `scan_failed`. Signed URLs are never issued for unvalidated or infected objects. |
| **Audit** | `document.downloaded` (always) |

### POST `/cases/{case_id}/documents/request-message`

| | |
|---|---|
| **Purpose** | Generate copyable message listing missing documents |
| **Response** | `{ message: "Dear ..., please provide: 1. PAN Card 2. ..." }` |

---

## 8. Lender Applications (`/api/v1/cases/{case_id}/applications`)

### GET `/cases/{case_id}/applications`

| | |
|---|---|
| **Purpose** | List lender applications for a case (side-by-side data) |
| **Authorization** | Same as case |

### POST `/cases/{case_id}/applications`

| | |
|---|---|
| **Purpose** | Add a lender application |
| **Authorization** | Owner, Manager, Processor |
| **Request** | `{ lender_id, product, login_ref?, login_date? }` |
| **Side effects** | Recalculate document checklist if lender-specific rules exist |
| **Audit** | `lender_application.created` |

### PATCH `/cases/{case_id}/applications/{id}`

| | |
|---|---|
| **Purpose** | Update application details (query, sanction, disbursal) |
| **Authorization** | Owner, Manager, Processor |
| **Request** | `{ status?, query_notes?, sanction_terms?, rejection_reason_code?, disbursal?, is_winning?, version }` |
| **Validation** | BR-04 (rejection reason); BR-05 (only one winning); BR-08 (disbursal <= sanction) |
| **Side effects** | On disbursal: create payout expectation (FR-PAY-002); update case status; create PDD items |
| **Errors** | 409 Version conflict; 422 Business rule violation |
| **Audit** | `lender_application.updated` |
| **Notification** | `sanction`, `disbursal`, `query` events |

---

## 9. PDD Items (`/api/v1/pdd`)

### GET `/pdd`

| | |
|---|---|
| **Purpose** | PDD board: list all PDD items with ageing |
| **Authorization** | Owner, Manager, Processor |
| **Filtering** | `?status=pending&lender_id={uuid}&owner_id={uuid}&ageing_bucket=0-7` |
| **Response** | Items with computed ageing, grouped by bucket |

### PATCH `/pdd/{id}`

| | |
|---|---|
| **Purpose** | Update PDD item status |
| **Authorization** | Owner, Manager, Processor |
| **Request** | `{ status, received_date?, notes? }` |
| **Side effects** | If all PDD items complete and expectation is Held with gating=pdd_complete, move expectation to Due |
| **Audit** | `pdd_item.updated` |

---

## 10. Tasks & Follow-ups (`/api/v1/tasks`)

### GET `/tasks`

| | |
|---|---|
| **Purpose** | List operational tasks, follow-up calls, and document reminders |
| **Authorization** | Authenticated user (Field Executive views own/assigned; Manager/Owner views org) |
| **Filtering** | `?status=pending&due_date=today\|overdue\|upcoming&owner_id={uuid}&case_id={uuid}` |
| **Pagination** | Cursor-based |
| **Response** | Array of `{ id, case_id, case_number, customer_name, type, title, description, due_date, due_time, assigned_to, status }` |

### POST `/cases/{case_id}/tasks`

| | |
|---|---|
| **Purpose** | Create a scheduled follow-up call, client reminder, or underwriter task |
| **Authorization** | Owner, Manager, Processor, Field Executive (own cases) |
| **Request** | `{ type, title, description?, due_date, due_time?, assigned_to_id? }` |
| **Validation** | Due date required; valid type (`call`, `document_pickup`, `query_resolution`, `bank_followup`, `other`) |
| **Audit** | `task.created` |

### PATCH `/tasks/{id}`

| | |
|---|---|
| **Purpose** | Complete, reschedule, or cancel a task/follow-up |
| **Authorization** | Assigned user, Manager, Owner |
| **Request** | `{ status: "completed" \| "cancelled" \| "pending", outcome_notes?, due_date? }` |
| **Audit** | `task.updated` |

---

## 11. Sources (`/api/v1/sources`)

### GET `/sources`

| | |
|---|---|
| **Purpose** | List sources |
| **Authorization** | Owner, Manager, Accountant |
| **Filtering** | `?type=dealer&is_active=true` |

### POST `/sources`

| | |
|---|---|
| **Purpose** | Create a source |
| **Authorization** | Owner, Manager |
| **Request** | `{ type, name, contact_name?, contact_mobile?, contact_email?, parent_id?, agreement_terms? }` |
| **Audit** | `source.created` |

### PATCH `/sources/{id}`

| | |
|---|---|
| **Purpose** | Update source |
| **Authorization** | Owner, Manager |
| **Audit** | `source.updated` |

### GET `/sources/report`

| | |
|---|---|
| **Purpose** | Source performance report |
| **Authorization** | Owner, Manager, Accountant |
| **Filtering** | `?date_from=&date_to=&type=` |
| **Response** | Per-source: cases, submissions, approvals, disbursals, conversion rate, accrued payout |

---

## 11. Payout Rules (`/api/v1/payout/rules`)

### GET `/payout/rules`

| | |
|---|---|
| **Purpose** | List payout rules |
| **Authorization** | Owner, Accountant, Auditor (read) |
| **Filtering** | `?lender_id={uuid}&product=used_car&active_only=true` |

### POST `/payout/rules`

| | |
|---|---|
| **Purpose** | Create a new payout rule |
| **Authorization** | Owner, Accountant (with reason) |
| **Request** | `{ lender_id, product, effective_from, effective_to?, basis, rate_percent?, flat_amount?, slabs?, conditions?, gating_condition?, clawback_days?, tds_applicable, tds_rate?, gst_mode? }` |
| **Validation** | No overlapping effective dates for same lender+product |
| **Audit** | `payout_rule.created` |

---

## 12. Payout Expectations (`/api/v1/payout/expectations`)

### GET `/payout/expectations`

| | |
|---|---|
| **Purpose** | List expectations with status |
| **Authorization** | Owner, Accountant, Auditor |
| **Filtering** | `?status=held&lender_id={uuid}` |
| **Response** | Expectations with case reference, amounts, status |

### GET `/payout/expectations/attention`

| | |
|---|---|
| **Purpose** | Attention list: no-rule, held, variance cases |
| **Authorization** | Owner, Accountant |

### PATCH `/payout/expectations/{id}`

| | |
|---|---|
| **Purpose** | Override expectation |
| **Authorization** | Owner, Accountant (reason required) |
| **Request** | `{ expected_gross?, expected_net?, status?, override_reason }` |
| **Audit** | `payout_expectation.overridden` |

---

## 13. Reconciliation (`/api/v1/payout/reconciliation`)

### POST `/payout/statements/import`

| | |
|---|---|
| **Purpose** | Import lender statement (dry-run or commit) |
| **Authorization** | Owner, Accountant |
| **Request** | Multipart: file + `{ lender_id, mapping_id?, dry_run: true }` |
| **Response (dry run)** | `{ total_rows, valid_rows, invalid_rows, preview: [...], errors: [...] }` |
| **Response (commit)** | `{ import_batch_id, imported_count, matched_count, unmatched_count }` |
| **Audit** | `statement.imported` |

### GET `/payout/receipts`

| | |
|---|---|
| **Purpose** | List payout receipts |
| **Authorization** | Owner, Accountant, Auditor |
| **Filtering** | `?lender_id={uuid}&match_status=unmatched&import_batch_id={uuid}` |

### POST `/payout/receipts`

| | |
|---|---|
| **Purpose** | Manual receipt entry |
| **Authorization** | Owner, Accountant |
| **Request** | `{ lender_id, loan_account_no?, customer_name?, receipt_date, gross_amount, tds_amount?, net_amount, matched_case_id? }` |
| **Audit** | `payout_receipt.created` |

### POST `/payout/reconciliation/match`

| | |
|---|---|
| **Purpose** | Match a receipt to an expectation |
| **Authorization** | Owner, Accountant |
| **Request** | `{ receipt_id, expectation_id, resolution_note? }` |
| **Side effects** | Create reconciliation record; update expectation status; classify variance |
| **Audit** | `reconciliation.matched` |

### GET `/payout/reconciliation/outstanding`

| | |
|---|---|
| **Purpose** | Outstanding payout report by lender with ageing |
| **Authorization** | Owner, Accountant |
| **Filtering** | `?lender_id={uuid}&date_from=&date_to=` |

---

## 14. Dashboard (`/api/v1/dashboard`)

### GET `/dashboard/overview`

| | |
|---|---|
| **Purpose** | Business overview dashboard |
| **Authorization** | Owner, Manager |
| **Filtering** | `?date_from=&date_to=` |
| **Response** | Pipeline counts, payout performance, stuck cases, docs pending, conversion metrics |

### GET `/dashboard/today`

| | |
|---|---|
| **Purpose** | Today view: due, overdue, stuck |
| **Authorization** | All roles (scoped to own items for Field Executive) |
| **Response** | Tasks due today, overdue tasks, stuck cases, expiring documents |

### GET `/dashboard/kpis`

| | |
|---|---|
| **Purpose** | KPI metrics per PRD 9.1 |
| **Authorization** | Owner, Manager |
| **Filtering** | `?date_from=&date_to=&lender_id=&product=&source_id=` |
| **Response** | Approval rate, disbursal conversion, average ticket, payout realisation, variance, source quality |

---

## 15. Notifications (`/api/v1/notifications`)

### GET `/notifications`

| | |
|---|---|
| **Purpose** | List notifications for current user |
| **Pagination** | Cursor-based |
| **Response** | Notifications with unread_count in meta |

### PATCH `/notifications/{id}/read`

| | |
|---|---|
| **Purpose** | Mark notification as read |

### POST `/notifications/read-all`

| | |
|---|---|
| **Purpose** | Mark all notifications as read |

---

## 16. Audit Log (`/api/v1/audit`)

### GET `/audit`

| | |
|---|---|
| **Purpose** | Search audit log |
| **Authorization** | Owner, Auditor |
| **Filtering** | `?actor_id={uuid}&entity_type=case&entity_id={uuid}&action=status_changed&date_from=&date_to=` |
| **Pagination** | Cursor-based |

### GET `/audit/export`

| | |
|---|---|
| **Purpose** | Export audit log as CSV |
| **Authorization** | Owner, Auditor |
| **Audit** | `audit.exported` |

---

## 17. Consent (`/api/v1/consent`)

### POST `/consent`

| | |
|---|---|
| **Purpose** | Record consent for a party |
| **Authorization** | Owner, Manager, Processor, Field Executive |
| **Request** | `{ party_id, purpose, notice_version, channel }` |
| **Audit** | `consent.recorded` |

### GET `/parties/{id}/consent`

| | |
|---|---|
| **Purpose** | Get consent records for a party |
| **Authorization** | Owner, Manager, Auditor |

---

## 18. Data Imports (`/api/v1/imports`)

### POST `/imports/dry-run`

| | |
|---|---|
| **Purpose** | Validate CSV/Excel upload against entity schema (parties, cases, sources, lenders) without persisting |
| **Authorization** | Owner, Manager |
| **Request** | Multipart form with `file`, `entity_type`, `column_mapping?` |
| **Response** | `{ total_rows, valid_rows, invalid_rows, errors: [{ row_number, field, reason }] }` |

### POST `/imports/execute`

| | |
|---|---|
| **Purpose** | Execute validated import batch and persist records |
| **Authorization** | Owner |
| **Request** | `{ dry_run_id }` or multipart form with valid rows |
| **Response** | `{ batch_id, total_imported, status: "completed", expires_revert_at }` |
| **Audit** | `import.batch_executed` |

### POST `/imports/{batch_id}/revert`

| | |
|---|---|
| **Purpose** | Roll back an import batch within 24 hours (FR-IMP-003) |
| **Authorization** | Owner |
| **Validation** | Batch must be within 24-hour reversal window and not have downstream disbursed payout ties |
| **Response** | `{ batch_id, status: "reverted", reverted_count }` |
| **Audit** | `import.batch_reverted` |

---

## 19. Privacy & Data Subject Access Requests (`/api/v1/privacy`)

### POST `/privacy/dsar`

| | |
|---|---|
| **Purpose** | Submit a Data Subject Access Request (access, correction, erasure) per DPDP Act |
| **Authorization** | Owner, Manager, Auditor |
| **Request** | `{ party_id, request_type: "access" \| "correction" \| "erasure", details }` |
| **Audit** | `privacy.dsar_created` |

### GET `/privacy/dsar`

| | |
|---|---|
| **Purpose** | List and filter active DSAR compliance requests |
| **Authorization** | Owner, Auditor |
| **Filtering** | `?status=pending\|fulfilled\|rejected&request_type=` |
| **Response** | Array of `{ id, party_id, customer_name, request_type, status, created_at, fulfilled_at }` |

### PATCH `/privacy/dsar/{id}`

| | |
|---|---|
| **Purpose** | Record resolution, data export, or fulfillment of DSAR |
| **Authorization** | Owner only |
| **Request** | `{ status: "fulfilled" \| "rejected", resolution_notes }` |
| **Audit** | `privacy.dsar_resolved` |

---

## 20. Configuration (`/api/v1/config`)

### GET `/config/lenders`

List active lenders for the org.

### GET `/config/document-types`

List document types.

### GET `/config/sla`

Get SLA configuration.

### PUT `/config/sla`

Update SLA configuration. Authorization: Owner only.

### GET `/config/status-transitions`

Get allowed status transitions for an entity type.

---

## 21. Health (`/health`)

### GET `/health`

| | |
|---|---|
| **Purpose** | Liveness check |
| **Authentication** | None |
| **Response** | `{ status: "ok", database: "ok", redis: "ok", storage: "ok" }` |

### GET `/health/ready`

| | |
|---|---|
| **Purpose** | Readiness check |
| **Authentication** | None |
