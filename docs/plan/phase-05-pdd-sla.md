# Phase 05 — PDD and SLA Tracking

## Objective

Implement the Post-Disbursal Documents (PDD) board, RC/hypothecation tracking, and the connection between PDD completion and payout gating. This phase bridges the disbursal event to the payout engine.

## Dependencies

- PH-04 (Lender Workflow): lender applications with disbursal, status machine

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-WFL-007 | PDD board with items by application, due date, owner, status, ageing buckets |
| FR-WFL-008 | Track RC hypothecation endorsement, insurance with lender clause, Form 34 |

## Database Changes

### New Tables
- `pdd_items` — linked to lender_application, with type, due date, owner, status, RLS

### Migrations
- `026_create_pdd_items.py`
- `027_rls_pdd_items.py`

## Backend Modules

### `app/modules/pdd/`
- `router.py` — PDD board listing, item update
- `service.py` — Auto-create PDD items on disbursal; status updates; ageing bucket computation
- `models.py` — PDDItem model
- `schemas.py` — PDDItem schemas with computed ageing

### Integration with disbursal
- When a lender application is marked Disbursed, auto-create PDD items based on configuration:
  - RC with hypothecation endorsement
  - Insurance with lender clause
  - Form 34 receipt
  - Additional configurable items per lender

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/pdd` | PDD board with filters and ageing |
| GET | `/api/v1/cases/{case_id}/applications/{id}/pdd` | PDD items for a specific application |
| PATCH | `/api/v1/pdd/{id}` | Update PDD item status |

## Frontend Routes/Components

- `/pdd` — PDD Board page:
  - Kanban-style or table view by ageing bucket (0-7, 8-15, 16-30, 30+ days)
  - Filters: lender, owner, status
  - Quick-update status actions
  - Link to case detail
- Case detail → PDD section showing items for each lender application

### Components
- `PDDBoard` — ageing bucket view with item cards
- `PDDItemCard` — type, due date, owner, status, ageing indicator
- `PDDItemForm` — update status, received date, notes

## Business Rules

- PDD items auto-created on disbursal based on lender/product configuration
- Standard PDD types: RC hypothecation, insurance clause, Form 34 (configurable per lender)
- Ageing buckets: 0-7 days (green), 8-15 days (amber), 16-30 days (orange), 30+ days (red)
- PDD completion is a gating condition for payout (connected in PH-06)
- PDD overdue triggers notifications (connected in PH-09)

## Security Implications

- PDD items follow case-level access control
- Status changes audited

## Tests

- PDD items auto-created on disbursal
- PDD item status update
- Ageing bucket computation correct
- PDD board filtering by lender, owner, status
- Cross-tenant isolation

## Acceptance Criteria

1. PDD items automatically created when lender application is disbursed
2. PDD board shows items grouped by ageing buckets
3. Item status can be updated (pending, submitted, completed)
4. Ageing computed correctly from due date

## Definition of Done

- [ ] PDD items auto-created on disbursal
- [ ] PDD board UI with ageing buckets
- [ ] Status update workflow
- [ ] Audit logging on changes
- [ ] Tests passing

## Risks

- PDD item types vary by lender — must be configurable, not hardcoded

## Files Expected to Change/Create

```
backend/app/modules/pdd/__init__.py, router.py, service.py, models.py, schemas.py
backend/migrations/versions/026..027
backend/tests/test_pdd.py

frontend/src/features/pdd/
  PDDBoard.tsx, PDDItemCard.tsx, PDDItemForm.tsx, PDDBoardPage.tsx
```
