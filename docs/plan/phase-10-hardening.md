# Phase 10 — Hardening

## Objective

Production-readiness hardening: 2FA, data import/export, consent management (P1), retention workflows, performance optimization, security audit, backup verification, monitoring, and the final security review gate.

## Dependencies

- All previous phases (PH-00 through PH-09) must be functionally complete

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-AUTH-004 | TOTP 2FA mandatory for Owner and Accountant |
| FR-DOC-009 | Merge images to PDF |
| FR-DOC-010 | Link-based customer upload (with legal review) |
| FR-NTF-003 | Notification preferences, daily digest, quiet hours |
| FR-PRV-003 | Consent withdrawal and DSAR log |
| FR-PRV-004 | Retention schedule and deletion workflow |
| FR-PRV-005 | Breach register and runbook |
| FR-IMP-001..003 | Data import from CSV/Excel with dry run and reversal |
| FR-RPT-004 | Report filtering by date, lender, product, source, owner, status |
| NFR-PRF-001 | List/search at most 1.5s at P95 |
| NFR-PRF-002 | Dashboard at most 3s at P95 |
| NFR-PRF-004 | Statement import 5000 lines at most 60s |
| NFR-SEC-009 | Penetration test |
| NFR-SEC-010 | Download watermark |
| NFR-REL-001 | Automated backups, restore tested |
| NFR-REL-003 | 99.5% availability target |
| NFR-REL-004 | Monitoring and alerting |
| IF-4 | Hindi labels (P1) |
| IF-6 | WCAG 2.1 AA compliance |

## Database Changes

- Performance indexes based on query analysis
- Materialized views for dashboard queries if needed
- `data_subject_requests` table (P1)

### Migrations
- `041_create_data_subject_requests.py`
- `042_performance_indexes.py`
- `043_materialized_views.py` (if needed)

## Backend Modules

### `app/modules/auth/` (updates)
- TOTP 2FA setup, verification, recovery codes
- Mandatory 2FA enforcement for Owner and Accountant roles

### `app/modules/import_export/`
- Generic CSV/Excel import for parties, cases, sources, lenders
- Dry-run validation report
- Import with rollback capability (24-hour reversal window)
- Import batch tracking and audit

### `app/modules/privacy/` (updates)
- DSAR (Data Subject Access Request) logging with due dates
- Consent withdrawal workflow
- Retention schedule enforcement (flag records, audited deletion)
- Breach register (incident log)

### `app/modules/documents/` (updates)
- Image-to-PDF merge service
- Download watermarking (user + timestamp overlay)

### Performance
- Query optimization based on EXPLAIN ANALYZE
- Database connection pooling tuning
- Redis caching for dashboard queries
- Pagination optimization
- API response time monitoring

### Monitoring
- Prometheus metrics endpoint
- Grafana dashboard templates
- Error alerting (email/webhook)
- Health check automation

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/2fa/setup` | Initialize TOTP setup |
| POST | `/api/v1/auth/2fa/verify` | Verify TOTP code |
| POST | `/api/v1/import/parties` | Import parties from CSV/Excel |
| POST | `/api/v1/import/cases` | Import cases from CSV/Excel |
| GET | `/api/v1/import/batches` | List import batches |
| POST | `/api/v1/import/batches/{id}/reverse` | Reverse an import |
| POST | `/api/v1/privacy/dsar` | Create DSAR |
| GET | `/api/v1/privacy/dsar` | List DSARs |
| POST | `/api/v1/documents/merge-pdf` | Merge images to PDF |

## Frontend Routes/Components

- 2FA setup wizard with QR code
- Data import wizard (upload → mapping → dry-run → commit)
- DSAR management page
- Notification preferences page
- Performance monitoring (admin)

## Business Rules

- 2FA mandatory for Owner and Accountant on login
- Import reversal only within 24 hours
- DSAR has configurable due date (default 30 days)
- Retention deletion is audited and irreversible
- Breach register entries are append-only

## Security Implications

**Review Gate FINAL-01** — the final security review before production readiness.

- Full security audit checklist
- Penetration test preparation
- Backup and restore verification
- All rate limits verified
- All audit completeness verified

## Tests

- 2FA setup and login flow
- Import with valid and invalid data
- Import reversal within window
- Import reversal after window fails
- DSAR creation and tracking
- Retention flagging
- Performance benchmarks (P95 response times)
- Backup and restore round-trip
- Full OWASP ASVS L2 checklist items

## Acceptance Criteria

1. 2FA works for Owner and Accountant
2. Data import with dry-run and reversal
3. DSAR logging operational
4. List/search responses at most 1.5s at P95
5. Dashboard responses at most 3s at P95
6. Backup and restore verified
7. Monitoring and alerting operational
8. **Review Gate FINAL-01 passed**

## Definition of Done

- [ ] 2FA operational
- [ ] Data import/export functional
- [ ] Privacy operations (DSAR, retention) operational
- [ ] Performance targets met
- [ ] Monitoring and alerting configured
- [ ] Backup and restore tested
- [ ] Security audit checklist complete
- [ ] Seed data for demo scenarios
- [ ] **Review Gate FINAL-01 passed**

## Risks

- Performance optimization may require schema changes
- Penetration test findings may require rework
- 2FA adoption friction for users unfamiliar with TOTP

## Files Expected to Change/Create

```
backend/app/modules/auth/ (updates for 2FA)
backend/app/modules/import_export/__init__.py, router.py, service.py, schemas.py
backend/app/modules/privacy/ (updates for DSAR, retention)
backend/app/modules/documents/ (updates for PDF merge, watermark)
backend/migrations/versions/041..043
backend/tests/test_2fa.py, test_import.py, test_dsar.py, test_performance.py
monitoring/prometheus.yml, grafana/dashboards/
```
