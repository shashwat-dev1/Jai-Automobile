# Phase 04 — Lender Applications and Workflow

## Objective

Implement lender applications (one-to-many per case), the full status workflow engine with SLA tracking, follow-up tasks, and the document-gate that blocks moving to Applied without mandatory documents.

## Dependencies

- PH-03 (Documents): checklist engine needed for document-gate
- PH-02 (Core Domain): cases, status machine foundation

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-LAP-001 | Case supports multiple lender applications with lender, product, login ref, date, status |
| FR-LAP-002 | Record queries, sanction terms, rejection reason, disbursal |
| FR-LAP-003 | Side-by-side display of lender applications |
| FR-LAP-004 | Rejected application requires reason code (BR-04) |
| FR-LAP-005 | At most one winning application; only Disbursed can be winning (BR-05) |
| FR-LAP-006 | Disbursed amount may not exceed sanctioned without override (BR-08) |
| FR-WFL-001 | Enforce allowed status transitions; 409 with allowed states |
| FR-WFL-002 | Statuses and SLAs configurable per org |
| FR-WFL-003 | Status change records from/to/user/timestamp/note |
| FR-WFL-004 | Compute ageing; flag Stuck when exceeding SLA |
| FR-WFL-005 | Set next action, owner, due date on case or application |
| FR-WFL-006 | Applied blocked without mandatory docs; Manager override with reason (BR-03) |

## Database Changes

### New Tables
- `lenders` — per-org lender registry, RLS
- `lender_applications` — full lifecycle with sanction/disbursal, RLS
- `tasks` — follow-up tasks with owner, due date, RLS

### Migrations
- `019_create_lenders.py`
- `020_create_lender_applications.py`
- `021_create_tasks.py`
- `022_rls_lender_workflow.py`
- `023_seed_lenders.py` — fictional demo lenders
- `024_populate_sla_configs.py` — default SLA values per stage
- `025_populate_status_transitions.py` — default allowed transitions

## Backend Modules

### `app/modules/lenders/`
- Lender CRUD (org-scoped registry)
- Lender list for dropdowns

### `app/modules/lenders/applications/`
- Lender application CRUD
- Status transitions (Logged In → Under Verification ↔ Query → Sanctioned → Accepted → Disbursed)
- Rejection with reason code enforcement
- Winning application constraint (at most one per case, only Disbursed)
- Disbursal validation (amount <= sanctioned unless override with reason)
- On disbursal: update case status to Disbursed, trigger payout expectation creation (hook for PH-06)

### `app/modules/workflow/`
- `engine.py` — State machine engine: validate transitions against configurable rules
- `sla.py` — Ageing computation, stuck-case detection
- `document_gate.py` — Check mandatory documents before Applied transition; allow Manager override
- SLA configuration CRUD

### `app/modules/workflow/tasks/`
- Task (follow-up) CRUD
- Task list with due/overdue filtering
- Task assignment and completion

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/config/lenders` | List lenders |
| POST | `/api/v1/config/lenders` | Create lender |
| PATCH | `/api/v1/config/lenders/{id}` | Update lender |
| GET | `/api/v1/cases/{case_id}/applications` | List lender applications |
| POST | `/api/v1/cases/{case_id}/applications` | Add lender application |
| PATCH | `/api/v1/cases/{case_id}/applications/{id}` | Update application (status, terms, disbursal) |
| GET | `/api/v1/tasks` | List tasks (filterable by owner, status, due date) |
| POST | `/api/v1/tasks` | Create follow-up task |
| PATCH | `/api/v1/tasks/{id}` | Update/complete task |
| GET | `/api/v1/config/sla` | Get SLA configuration |
| PUT | `/api/v1/config/sla` | Update SLA configuration (Owner only) |

## Frontend Routes/Components

- Case detail → **Lender Applications section**:
  - Side-by-side comparison view (FR-LAP-003)
  - Each application shows: lender, status chip, login ref, sanction terms, disbursal
  - Add application button
  - Status change action with transition validation
  - Rejection reason modal
  - Disbursal recording form with override warning
  - Winning application marker
- Case detail → **Follow-ups section**:
  - Task list with due dates
  - Add follow-up action
  - Complete/cancel task
- Case list → **Stuck flag** column and filter
- **Workflow configuration** page (Owner):
  - SLA settings per stage
  - Status transition rules viewer

### Components
- `LenderApplicationCard` — displays one application
- `ApplicationComparison` — side-by-side multi-application view
- `SanctionTermsForm` — amount, tenure, rate, margin money, date
- `DisbursalForm` — date, amount, reference, override reason
- `RejectionReasonModal` — reason code dropdown + notes
- `TaskList` — sortable task list with due date indicators
- `TaskForm` — create/edit follow-up
- `SLAIndicator` — shows days in stage vs SLA, color-coded

## Business Rules

- BR-03: Cannot move case to Applied if mandatory documents are missing; Manager can override with reason (audited)
- BR-04: Rejected lender application requires rejection reason code
- BR-05: At most one winning application per case; only Disbursed can be winning
- BR-08: Disbursed amount cannot exceed sanctioned amount without recorded override
- BR-14: Status changes follow the allowed transition table
- Lender application status machine independent from case status machine
- Disbursal of winning application triggers case status to Disbursed
- All Rejected → case moves to Rework (or Closed)
- SLA computation: `now() - entered_stage_at > sla_hours`
- Follow-up tasks have owner, due date, and status

## Security Implications

- Lender applications contain financial terms — visible to Owner, Manager, Processor, Accountant only
- Disbursal data restricted from Field Executive
- Override reasons are audited and cannot be modified after submission
- SLA configuration changes audited

## Tests

- Add lender application to case
- Multiple applications per case
- Side-by-side data structure correct
- Status transition: valid transitions succeed
- Status transition: invalid transitions return 409 with allowed states
- Rejection without reason code fails
- Winning application constraint: only one per case, only Disbursed
- Disbursal amount exceeding sanction without override fails
- Disbursal amount exceeding sanction with override succeeds (audited)
- Document gate: Applied blocked with missing mandatory docs
- Document gate: Manager override with reason succeeds (audited)
- SLA computation: correct ageing calculation
- Stuck flag set when ageing exceeds SLA
- Task CRUD and filtering
- Task assignment to user
- Optimistic locking on application update
- Cross-tenant isolation on lender applications
- Audit records created for all mutations

## Acceptance Criteria

1. Multiple lender applications can be added to a case
2. Applications displayed side by side
3. Status transitions enforce the allowed table
4. Rejection requires reason code
5. At most one winning application per case
6. Disbursal validates against sanction amount
7. Moving to Applied blocked without mandatory documents
8. Manager override with reason works and is audited
9. SLA ageing computed correctly; stuck cases flagged
10. Follow-up tasks can be created, assigned, and completed

## Definition of Done

- [ ] Lender application CRUD with full status machine
- [ ] Side-by-side display working
- [ ] Business rules BR-03, BR-04, BR-05, BR-08, BR-14 enforced and tested
- [ ] Document gate with manager override
- [ ] SLA computation and stuck detection
- [ ] Follow-up tasks operational
- [ ] All audit events logged
- [ ] Frontend pages complete with real data
- [ ] Tests passing

## Risks

- Document gate interaction with lender-specific checklist rules (complexity)
- SLA timer precision across time zones (use UTC consistently)
- Winning application race condition if two processors act simultaneously

## Files Expected to Change/Create

```
backend/app/modules/
  lenders/__init__.py, router.py, service.py, models.py, schemas.py
  lenders/applications/__init__.py, router.py, service.py
  workflow/__init__.py, engine.py, sla.py, document_gate.py
  workflow/tasks/__init__.py, router.py, service.py, models.py, schemas.py
backend/migrations/versions/019..025
backend/tests/test_lender_applications.py, test_workflow.py, test_document_gate.py, test_sla.py, test_tasks.py
backend/seed/seed_lenders.py

frontend/src/features/
  lenders/
    LenderApplicationCard.tsx, ApplicationComparison.tsx,
    SanctionTermsForm.tsx, DisbursalForm.tsx, RejectionReasonModal.tsx
  workflow/
    TaskList.tsx, TaskForm.tsx, SLAIndicator.tsx,
    WorkflowConfigPage.tsx
```
