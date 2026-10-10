# Phase 02 — Core Domain (Parties, Cases, Vehicles, Sources)

## Objective

Build the core domain entities: parties, cases, vehicles, and sources. This establishes the central data model that all subsequent features depend on, including duplicate detection, case creation, vehicle records, consent tracking, and source attribution.

## Dependencies

- PH-01 (Auth/Tenancy): authentication, RBAC, tenant isolation, audit

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-PTY-001 | Create party with name, mobile, employment type, address |
| FR-PTY-002 | Duplicate warning on same mobile or PAN last four |
| FR-PTY-003 | Search parties by name, mobile, PAN last four, case/vehicle number |
| FR-PTY-004 | PAN encrypted; Aadhaar masked (last four only) |
| FR-PTY-005 | Party role per case: applicant, co-applicant, guarantor, seller |
| FR-CAS-001 | Create case with applicant, source, owner, product |
| FR-CAS-002 | Unique case number per organization |
| FR-CAS-003 | Case detail with chronological timeline |
| FR-CAS-004 | List/filter cases by status, lender, product, source, owner, age, stuck |
| FR-CAS-005 | Duplicate case warning by vehicle number or applicant |
| FR-CAS-006 | Optimistic locking via version column |
| FR-VEH-001 | Vehicle with condition, registration, make/model, chassis/engine, prices |
| FR-VEH-002 | Registration number format validation |
| FR-VEH-003 | Valuation and existing hypothecation |
| FR-VEH-004 | Link-out helper for vehicle verification |
| FR-SRC-001 | Sources: dealer, sub-DSA, connector, employee, direct, walk-in |
| FR-SRC-002 | Every case has one primary source |
| FR-PRV-001 | Record consent per party and purpose |
| FR-PRV-002 | Flag cases without consent |
| NFR-SEC-008 | Masked fields; reveal with audit |
| NFR-PRV-001 | Personal data for recorded purposes only |
| NFR-PRV-002 | Data limited to needed fields; optional fields marked |
| LEG-005 | Aadhaar stored masked only |
| IF-2 | Case creation: max 6 mandatory fields |
| IF-5 | INR with Indian digit grouping |
| BR-02 | Case has one owner, one primary source, at least one applicant |

## Database Changes

### New Tables
- `parties` — with encrypted PAN, masked Aadhaar, RLS
- `sources` — with type, parent, agreement terms, RLS
- `cases` — with case_no auto-generation, status, version, RLS
- `case_parties` — junction table for party-case-role, RLS
- `vehicles` — linked to case, with hypothecation fields, RLS
- `consent_records` — per party per purpose, RLS
- `status_history` — for case status changes, RLS

### Migrations
- `006_create_parties.py`
- `007_create_sources.py`
- `008_create_cases.py`
- `009_create_case_parties.py`
- `010_create_vehicles.py`
- `011_create_consent_records.py`
- `012_create_status_history.py`
- `013_rls_core_domain.py` — RLS policies on all new tables

### Indexes
- `(org_id, mobile_primary)` on parties
- `(org_id, pan_last_four)` on parties
- `(org_id, name)` GIN trigram on parties
- `(org_id, case_no)` unique on cases
- `(org_id, status)` on cases
- `(org_id, source_id)` on cases
- `(org_id, owner_id)` on cases
- `(registration_no)` on vehicles where not null

## Backend Modules

### `app/modules/parties/`
- CRUD for parties
- Duplicate detection service (mobile match, PAN last four + name similarity)
- PAN encryption/decryption service (Fernet)
- Masked response serialization
- Reveal endpoint with audit logging
- Party search (name trigram, mobile, PAN last four)

### `app/modules/cases/`
- Case CRUD with auto-generated case_no (format: `LOS-{org_seq}`)
- Case list with filtering and cursor pagination
- Case detail aggregation (parties, vehicle, status history, timeline)
- Duplicate detection (vehicle number, applicant mobile in active cases)
- Optimistic locking enforcement (version check on update)
- Status change service (transition validation against allowed table)
- Status history recording
- Timeline assembly service

### `app/modules/vehicles/`
- Vehicle CRUD linked to case
- Registration number validation (Indian format: XX-NN-XX-NNNN)
- Hypothecation recording
- Link-out URL generation for Vahan/Parivahan portal

### `app/modules/sources/`
- Source CRUD
- Source hierarchy (parent-child for sub-DSA under aggregator)

### `app/modules/privacy/`
- Consent recording service
- Consent status check per case (flag if missing)

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/parties` | List/search parties |
| POST | `/api/v1/parties` | Create party (returns duplicate warnings) |
| GET | `/api/v1/parties/{id}` | Get party detail (masked) |
| PATCH | `/api/v1/parties/{id}` | Update party |
| POST | `/api/v1/parties/{id}/reveal` | Reveal masked field (audited) |
| GET | `/api/v1/cases` | List/filter cases |
| POST | `/api/v1/cases` | Create case (returns duplicate warnings) |
| GET | `/api/v1/cases/{id}` | Case detail with all related data |
| PATCH | `/api/v1/cases/{id}` | Update case (optimistic lock) |
| POST | `/api/v1/cases/{id}/status` | Change case status |
| GET | `/api/v1/cases/{id}/timeline` | Case timeline events |
| GET | `/api/v1/cases/{case_id}/vehicle` | Get vehicle |
| PUT | `/api/v1/cases/{case_id}/vehicle` | Create/update vehicle |
| GET | `/api/v1/sources` | List sources |
| POST | `/api/v1/sources` | Create source |
| PATCH | `/api/v1/sources/{id}` | Update source |
| POST | `/api/v1/consent` | Record consent |
| GET | `/api/v1/parties/{id}/consent` | Get consent records |

## Frontend Routes/Components

- `/cases` — Case list page with filters, search, sortable table
- `/cases/new` — Case creation form (max 6 mandatory fields for mobile)
- `/cases/:id` — Case detail page with:
  - Customer dossier section
  - Vehicle panel
  - Source & assignment section
  - Timeline/activity log
  - Status change action
- `/parties` — Party list/search
- `/parties/:id` — Party detail with masked fields and reveal button
- `/sources` — Source management list
- `/sources/new` and `/sources/:id` — Source CRUD forms

### Shared Components Built
- `DataTable` — sortable, filterable table with pagination
- `StatusChip` — colored status badge
- `FilterBar` — horizontal filter controls
- `SearchInput` — debounced search
- `CurrencyDisplay` — INR formatting with Indian grouping
- `DateDisplay` — relative/absolute date formatter
- `ConfirmModal` — for status changes
- `ConflictDialog` — for optimistic lock conflicts
- `MaskedField` — shows masked value with reveal button
- `EmptyState` — icon + message + action
- `Timeline` — chronological event display

## Business Rules

- BR-02: Case must have owner, source, and at least one applicant
- PAN encrypted at rest, searchable only by last four
- Aadhaar: only last 4 digits stored, never full number
- Case number auto-generated per org, sequential
- Status transitions validated against allowed table (default state machine from SRS Appendix C)
- Version column prevents concurrent edit conflicts (409 on mismatch)
- Consent status computed and flagged on case

## Security Implications

- PAN encryption key management (Fernet from env)
- Masked field reveal creates audit record (always)
- Field Executive sees only own cases (enforced in query + RLS)
- RLS on all 7 new tables
- Consent recording required for data processing compliance

## Tests

- Party CRUD with validation
- Duplicate detection: same mobile warns, same PAN last four + similar name warns
- PAN encryption/decryption round-trip
- Aadhaar stored as last 4 only (verify full number rejected)
- Masked API response (PAN, mobile masked by default)
- Reveal endpoint creates audit record
- Case creation with all required fields
- Case creation fails without applicant/source/owner
- Case number uniqueness per org
- Case list filtering by each parameter
- Optimistic lock: concurrent update returns 409
- Status transition: valid transitions succeed
- Status transition: invalid transitions return 409 with allowed states
- Status history recorded on each transition
- Vehicle registration validation (valid/invalid formats)
- Vehicle hypothecation recording
- Source CRUD and hierarchy
- Consent recording and missing-consent flag
- Cross-tenant isolation on all new entities (parties, cases, vehicles, sources)
- Field Executive scope filtering (sees only own cases)

## Acceptance Criteria

1. Party can be created, searched, and viewed with masked PAN/Aadhaar
2. Duplicate party warning appears on matching mobile or PAN
3. Case can be created on mobile with 6 fields in under 30 seconds
4. Case list filters work for all parameters
5. Case detail shows customer dossier, vehicle, source, and timeline
6. Status changes follow the allowed transition table
7. Optimistic lock conflict shown when two users edit simultaneously
8. Sources can be created with parent hierarchy
9. Consent can be recorded per party; missing consent flagged on case
10. All tenant isolation tests pass for new entities

## Definition of Done

- [ ] Party CRUD with encryption and duplicate detection
- [ ] Case CRUD with auto-numbering and status machine
- [ ] Vehicle CRUD with registration validation
- [ ] Source CRUD with hierarchy
- [ ] Consent recording and flagging
- [ ] Status history and timeline
- [ ] All frontend pages operational with real backend data
- [ ] Masked fields with audited reveal
- [ ] Optimistic locking functional
- [ ] RLS policies on all new tables
- [ ] Full test suite passing

## Risks

- PAN encryption key rotation complexity
- Trigram search performance on large party sets — may need pg_trgm extension
- Case number sequence gaps under concurrent creation

## Files Expected to Change/Create

```
backend/app/modules/
  parties/__init__.py, router.py, service.py, models.py, schemas.py
  cases/__init__.py, router.py, service.py, models.py, schemas.py, state_machine.py
  vehicles/__init__.py, router.py, service.py, models.py, schemas.py
  sources/__init__.py, router.py, service.py, models.py, schemas.py
  privacy/__init__.py, router.py, service.py, models.py, schemas.py
backend/app/shared/security.py (encryption utilities)
backend/migrations/versions/006..013
backend/tests/test_parties.py, test_cases.py, test_vehicles.py, test_sources.py, test_privacy.py
backend/seed/seed_core_domain.py

frontend/src/features/
  cases/CaseListPage.tsx, CaseDetailPage.tsx, CaseCreatePage.tsx, CaseTimeline.tsx
  parties/PartyListPage.tsx, PartyDetailPage.tsx
  sources/SourceListPage.tsx
frontend/src/shared/components/
  DataTable.tsx, StatusChip.tsx, FilterBar.tsx, CurrencyDisplay.tsx,
  DateDisplay.tsx, MaskedField.tsx, EmptyState.tsx, Timeline.tsx,
  ConflictDialog.tsx, ConfirmModal.tsx
frontend/src/shared/lib/formatters.ts
```
