# Phase 07 — Reconciliation

## Objective

Implement lender statement import, receipt recording, automatic matching of receipts to expectations, variance classification (matched/short/excess/missing/unmatched), clawback tracking, and the outstanding payout report.

## Dependencies

- PH-06 (Payout Engine): expectations exist to match against

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-PAY-006 | Record TDS per receipt; reconcile with Form 26AS/AIS |
| FR-PAY-007 | Payout receipts only against disbursed cases |
| FR-PAY-008 | Import statements (CSV/Excel) with dry run, saved mapping, error file |
| FR-PAY-009 | Match by loan account, customer, amount; classify results |
| FR-PAY-010 | Variance above tolerance on per-lender outstanding report |
| FR-PAY-011 | Clawback window tracking; clawback events |
| FR-PAY-012 | Manual reconciliation entry |
| BR-07 | Receipt only against disbursed case |

## Database Changes

### New Tables
- `payout_receipts` — imported or manual, with match status, RLS
- `reconciliations` — expectation-to-receipt match with result, RLS
- `clawback_events` — per lender application, RLS
- `statement_column_mappings` — saved import mappings per lender, RLS
- `import_batches` — tracks each import with counts and reversal window, RLS

### Migrations
- `032_create_payout_receipts.py`
- `033_create_reconciliations.py`
- `034_create_clawback_events.py`
- `035_create_statement_mappings.py`
- `036_create_import_batches.py`
- `037_rls_reconciliation.py`

## Backend Modules

### `app/modules/payout/reconciliation/`
- `router.py` — Statement import, receipt CRUD, matching, outstanding report
- `import_service.py` — CSV/Excel parser; column mapping; dry-run validation; commit; error file generation
- `matching_engine.py` — Auto-match algorithm:
  1. For each receipt row: find expectation by loan_account_no exact match
  2. If no match: try by customer_name similarity + lender match
  3. If matched: compare amounts within tolerance
  4. Classify: Matched (within tolerance), Short (receipt < expected), Excess (receipt > expected), Missing (expectation with no receipt), Unmatched (receipt with no expectation)
- `receipt_service.py` — Manual receipt entry and management
- `clawback_service.py` — Clawback window computation, event recording

### `app/workers/reconciliation_tasks.py`
- Statement import processing (background for large files)
- Daily clawback window check

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/payout/statements/import` | Import statement (dry-run or commit) |
| GET | `/api/v1/payout/statements/mappings` | List saved column mappings |
| POST | `/api/v1/payout/statements/mappings` | Save column mapping |
| GET | `/api/v1/payout/receipts` | List receipts |
| POST | `/api/v1/payout/receipts` | Manual receipt entry |
| POST | `/api/v1/payout/reconciliation/match` | Match receipt to expectation |
| GET | `/api/v1/payout/reconciliation/outstanding` | Outstanding report by lender |
| GET | `/api/v1/payout/clawbacks` | List clawback events |
| POST | `/api/v1/payout/clawbacks` | Record clawback event |

## Frontend Routes/Components

- `/payout/reconciliation` — Reconciliation dashboard:
  - Statement import wizard (file upload → column mapping → dry run → review → commit)
  - Unmatched receipts queue
  - Manual matching interface
  - Outstanding report with lender breakdown
- `/payout/receipts` — Receipt list with filters
- `/payout/clawbacks` — Clawback tracking list
- Case detail → Payout section updated with receipt info and reconciliation status

### Components
- `StatementImportWizard` — multi-step: upload, map columns, preview, commit
- `ColumnMapper` — drag-and-drop or dropdown column mapping
- `DryRunReport` — shows valid/invalid rows, errors, preview of matches
- `UnmatchedQueue` — list of unmatched receipts with manual match action
- `ReconciliationTable` — expectations with receipt matches, variance, resolution
- `OutstandingReport` — per-lender summary with ageing
- `ClawbackTimeline` — clawback window status per application

## Business Rules

- Receipts can only be recorded against disbursed cases (BR-07)
- Matching tolerance configurable per org (default: Rs 10)
- Statement import: invalid rows exported with error messages; valid rows importable
- Column mapping saved per lender for reuse
- Import batches reversible within 24 hours
- Clawback window computed from disbursal date + clawback_days from rule
- Clawback within window → expectation status changes to Clawed back
- Variance = receipt amount - expected amount (signed)
- Outstanding = expected but not yet received or partially received

## Security Implications

**Review Gate MONEY-01** covers PH-06 + PH-07 combined.

- Reconciliation data: Owner and Accountant only
- Statement files processed server-side, not exposed
- Import creates comprehensive audit trail
- Financial accuracy is critical — rounding, currency handling

## Tests

- Statement import: valid CSV parsed correctly
- Statement import: invalid rows identified with errors
- Statement import: dry-run shows preview without committing
- Statement import: commit creates receipt records
- Column mapping: saved and reused correctly
- Auto-matching: exact loan account match works
- Auto-matching: customer name fuzzy match works
- Variance classification: Short when receipt < expected
- Variance classification: Excess when receipt > expected
- Variance classification: Matched within tolerance
- Missing: expectations with no corresponding receipt
- Unmatched: receipts with no corresponding expectation
- Manual receipt entry against disbursed case
- Manual receipt against non-disbursed case fails
- Manual matching: receipt linked to expectation
- Outstanding report: correct per-lender totals
- Clawback window computation correct
- Clawback event recording
- Import batch reversal within 24 hours
- Import batch reversal after 24 hours fails
- Cross-tenant isolation on all reconciliation data

## Acceptance Criteria

1. CSV/Excel statement can be imported with column mapping
2. Dry-run shows validation results before commit
3. Auto-matching correctly classifies results
4. Variance displayed with correct amounts
5. Unmatched queue shows orphan receipts
6. Manual matching works
7. Outstanding report shows correct per-lender totals
8. Clawback window tracked and events recorded
9. **Review Gate MONEY-01 passed** (combined with PH-06)

## Definition of Done

- [ ] Statement import with dry-run validation
- [ ] Saved column mappings per lender
- [ ] Auto-matching engine with variance classification
- [ ] Manual receipt entry and manual matching
- [ ] Outstanding report by lender with ageing
- [ ] Clawback tracking
- [ ] Import batch reversal within 24 hours
- [ ] All tests passing
- [ ] Frontend reconciliation dashboard complete
- [ ] **Review Gate MONEY-01 passed**

## Risks

- Statement format variability across lenders
- Matching accuracy for customer name fuzzy matching
- Large statement files (5,000+ rows) — performance (NFR-PRF-004)
- Currency rounding in variance computation

## Files Expected to Change/Create

```
backend/app/modules/payout/reconciliation/
  __init__.py, router.py, import_service.py, matching_engine.py,
  receipt_service.py, clawback_service.py, models.py, schemas.py
backend/app/workers/reconciliation_tasks.py
backend/migrations/versions/032..037
backend/tests/test_reconciliation.py, test_matching_engine.py, test_clawback.py, test_statement_import.py

frontend/src/features/payout/
  ReconciliationPage.tsx, StatementImportWizard.tsx, ColumnMapper.tsx,
  DryRunReport.tsx, UnmatchedQueue.tsx, ReconciliationTable.tsx,
  OutstandingReport.tsx, ClawbackTimeline.tsx, ReceiptsPage.tsx
```
