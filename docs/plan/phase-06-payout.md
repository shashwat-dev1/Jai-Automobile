# Phase 06 — Payout Engine

## Objective

Implement the payout rule engine, expectation computation, split calculation, and the gating mechanism that holds payouts until conditions (like PDD completion) are met. This is the core of the "never lose a rupee of payout" promise.

## Dependencies

- PH-04 (Lender Workflow): disbursal event triggers expectation
- PH-05 (PDD/SLA): PDD completion is a gating condition

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-PAY-001 | Payout rules with lender, product, effective dates, basis, slabs, conditions, gating, clawback, TDS, GST |
| FR-PAY-002 | On disbursal: select rule by date, store snapshot, compute expected gross/net |
| FR-PAY-003 | No rule match: flag No rule, attention list, never zero |
| FR-PAY-004 | Gating condition: expectation stays Held until met |
| FR-PAY-005 | Manual override requires reason, audited |
| FR-SRC-003 | Split rules per source/case; total at most 100% |
| BR-06 | Expectation created only on disbursal; rule snapshot |
| BR-09 | Splits may not total more than 100% |
| BR-10 | Gating keeps expectation Held |
| BR-13 | Payout rule edits effective-dated; never alter snapshots |
| LEG-003 | TDS at configured rate; GST mode configurable |

## Database Changes

### New Tables
- `payout_rules` — effective-dated, with slabs/conditions JSONB, RLS
- `payout_expectations` — one per disbursed application, with rule snapshot, RLS
- `payout_splits` — per expectation, with beneficiary and share, RLS

### Migrations
- `028_create_payout_rules.py`
- `029_create_payout_expectations.py`
- `030_create_payout_splits.py`
- `031_rls_payout.py`

## Backend Modules

### `app/modules/payout/`
- `router.py` — Rule CRUD, expectation list, override, attention list
- `rules_service.py` — Rule CRUD with effective-date validation (no overlapping periods)
- `engine.py` — **Core payout computation engine**:
  1. Given a lender application (lender, product, disbursal date, disbursal amount)
  2. Find matching rule by (lender, product, effective_from <= disbursal_date <= effective_to)
  3. If no match → create expectation with status `no_rule`
  4. If match → snapshot rule, compute gross payout:
     - basis=percent: `disbursal_amount * rate_percent / 100`
     - basis=flat: `flat_amount`
     - basis=slab: find matching slab by disbursal_amount, apply rate
  5. Apply conditions filter (ticket range, vehicle age, segment)
  6. Compute TDS: `gross * tds_rate / 100` if applicable
  7. Compute net: `gross - tds`
  8. Check gating: if `gating_condition` set, status = `held`; else status = `due`
  9. Store snapshot and expectation
- `splits_service.py` — Create/update splits; validate total <= 100%
- `gating_service.py` — Check gating conditions (PDD complete, etc.); move Held → Due when met

### Integration hooks
- Disbursal event (from PH-04) → trigger `engine.create_expectation()`
- PDD completion event (from PH-05) → trigger `gating_service.check_and_release()`

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/payout/rules` | List payout rules |
| POST | `/api/v1/payout/rules` | Create payout rule |
| PATCH | `/api/v1/payout/rules/{id}` | Update payout rule (effective-dated) |
| GET | `/api/v1/payout/expectations` | List expectations |
| GET | `/api/v1/payout/expectations/attention` | Attention list (no rule, held, overdue) |
| PATCH | `/api/v1/payout/expectations/{id}` | Override expectation (reason required) |
| GET | `/api/v1/payout/expectations/{id}/splits` | Get splits for an expectation |
| PUT | `/api/v1/payout/expectations/{id}/splits` | Create/update splits |

## Frontend Routes/Components

- `/payout/rules` — Payout rules list with lender/product filters
- `/payout/rules/new` — Rule creation form (complex: basis selector, slab builder, conditions, gating)
- `/payout/expectations` — Expectations list with status filters
- `/payout/attention` — Attention list (no-rule, held, overdue)
- Case detail → **Payout section**: expected gross, net, status, splits, rule reference

### Components
- `PayoutRuleForm` — complex form with basis type selector, slab table builder, condition fields
- `ExpectationCard` — shows gross, TDS, net, status, gating info
- `SplitEditor` — editable table of beneficiaries with percentage/amount, total validation
- `AttentionList` — filtered list of expectations needing action
- `RuleSnapshotViewer` — read-only view of the frozen rule

## Business Rules

- Rule matching: exact match on lender + product + disbursal_date within effective range
- Effective dating: new rules don't alter existing snapshots; they only apply to future disbursals
- No overlapping effective dates for same lender + product combination
- "No rule" is NOT zero — it's a flagged state requiring attention
- Gating: PDD-based gating checks all PDD items complete for the application
- Splits: percentage or flat; total percentage across all beneficiaries <= 100%
- TDS rate configurable per rule (default from org settings)
- GST mode configurable: forward_charge, reverse_charge, exempt
- Override: only Owner or Accountant; reason mandatory; audited; original values preserved

## Security Implications

**Review Gate MONEY-01** applies after PH-06 + PH-07 combined.

- Payout data visible only to Owner, Accountant, Auditor
- Manager visibility configurable per org
- Field Executive never sees payout data (enforced in API)
- Override audit trail is critical — cannot be altered
- Rule snapshot immutability is critical — prevents retroactive payout manipulation

## Tests

### Payout Engine Tests (Critical — highest coverage requirement)
- Percent basis: correct computation from rate and disbursal amount
- Flat basis: correct flat amount returned
- Slab basis: correct slab selection and rate application
- Slab edge cases: amount exactly at boundary
- Rule matching: correct rule selected by effective date
- Rule matching: no rule → "No rule" status, not zero
- Rule matching: multiple rules, correct one selected by date
- Effective dating: new rule doesn't change existing expectations
- Gating: PDD gating → status = Held
- Gating: PDD complete → status moves to Due
- Gating: no gating → status = Due immediately
- TDS computation: correct deduction
- Net computation: gross - TDS
- Override: requires reason; original preserved; audited
- Override: without reason fails

### Split Tests
- Split creation with valid percentages
- Total percentage exceeding 100% fails
- Split amounts computed correctly from net payout

### Rule CRUD Tests
- Create rule with valid dates
- Overlapping effective dates rejected
- Rule update creates new effective period
- Deactivated rule not matched

### Security Tests
- Field Executive cannot access payout endpoints
- Processor cannot access payout endpoints
- Override audit record immutable

## Acceptance Criteria

1. Payout rule CRUD with effective dating and slab support
2. Expectation auto-created on disbursal with correct computation
3. "No rule" cases flagged on attention list (never zero)
4. Held expectations release when PDD complete
5. Splits enforce 100% total constraint
6. Override requires reason and is audited
7. TDS and GST correctly applied
8. Rule snapshots immutable
9. Payout data hidden from unauthorized roles

## Definition of Done

- [ ] Payout rule CRUD with effective dating
- [ ] Computation engine: percent, flat, slab basis all working
- [ ] Expectation auto-creation on disbursal
- [ ] No-rule flagging on attention list
- [ ] Gating mechanism (Held → Due)
- [ ] Split management with total constraint
- [ ] Override with mandatory reason and audit
- [ ] TDS/GST computation
- [ ] Rule snapshot immutability
- [ ] Full test suite with at least 90% coverage of engine module
- [ ] Frontend: rule management, expectation views, split editor
- [ ] All payout tests passing

## Risks

- Slab computation edge cases and rounding errors
- Effective-date transition: cases disbursed on the boundary date
- GST/TDS treatment varies — must be configurable, not assumed
- Performance of rule matching under high volume (index on effective dates)

## Files Expected to Change/Create

```
backend/app/modules/payout/
  __init__.py, router.py, engine.py, rules_service.py, splits_service.py,
  gating_service.py, models.py, schemas.py
backend/migrations/versions/028..031
backend/tests/test_payout_engine.py, test_payout_rules.py, test_payout_splits.py, test_payout_gating.py
backend/seed/seed_payout_rules.py

frontend/src/features/payout/
  PayoutRulesPage.tsx, PayoutRuleForm.tsx, ExpectationsPage.tsx,
  AttentionListPage.tsx, ExpectationCard.tsx, SplitEditor.tsx,
  RuleSnapshotViewer.tsx
```
