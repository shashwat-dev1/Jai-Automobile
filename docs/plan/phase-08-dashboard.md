# Phase 08 — Dashboards and Reports

## Objective

Implement the business overview dashboard, Today view, KPI computations, pipeline view, source reports, and data export. All dashboard metrics must come from actual application data — no faked numbers.

## Dependencies

- PH-02 through PH-07: all domain data must exist for metrics to be meaningful

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-RPT-001 | Dashboard: pipeline, docs pending, stuck, PDD ageing, conversion, payout; date filters |
| FR-RPT-002 | KPIs use PRD 9.1 formulas |
| FR-RPT-003 | Dashboard updates on data change (no manual refresh beyond reload) |
| FR-RPT-004 | Reports filterable by date, lender, product, source, owner, status |
| FR-RPT-005 | CSV/Excel export, permission-controlled, audit-logged |
| FR-RPT-006 | Field Executive sees only own performance |
| FR-SRC-004 | Source-wise reporting |
| IF-3 | Today view: overdue, due-today, stuck |

## Database Changes

No new tables. Queries against existing tables. May add materialized views or summary tables for performance:
- Consider `REFRESH MATERIALIZED VIEW CONCURRENTLY` for dashboard KPIs if needed

## Backend Modules

### `app/modules/reports/`
- `router.py` — Dashboard, today, KPIs, source report, export
- `dashboard_service.py` — Pipeline counts, payout performance, stuck cases, docs pending
- `kpi_service.py` — Compute KPIs per PRD 9.1 formulas:
  - Approval rate: sanctioned / logged_in (per lender, product)
  - Disbursal conversion: disbursed / sanctioned
  - Lead-to-disbursal: disbursed cases / created cases (period)
  - Average ticket: sum(disbursal_amount) / disbursed_count
  - Stage ageing: now - entered_stage_at
  - Stuck case: ageing > SLA
  - Payout realisation: net_received / net_expected (matured)
  - Payout variance: received - expected (per case, lender, month)
  - Source quality: weighted blend (configurable weights)
  - Doc-complete at login: cases with 100% docs at first login / total logged
- `source_report_service.py` — Per-source: cases, submissions, approvals, disbursals, conversion, payout
- `today_service.py` — Tasks due today, overdue tasks, stuck cases, expiring documents
- `export_service.py` — CSV/Excel generation, permission check, audit log

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/dashboard/overview` | Business overview dashboard |
| GET | `/api/v1/dashboard/today` | Today view |
| GET | `/api/v1/dashboard/kpis` | KPI metrics |
| GET | `/api/v1/dashboard/pipeline` | Pipeline by status |
| GET | `/api/v1/sources/report` | Source performance report |
| GET | `/api/v1/reports/export` | Export report as CSV/Excel |

## Frontend Routes/Components

- `/dashboard` — Business Overview dashboard (main landing page):
  - KPI strip: active pipeline, gross book, new inflow, docs pending, submitted, sanctioned, disbursed
  - Payout performance panel: expected, received, realization rate, pending
  - Commission chart: monthly expected vs settled bar chart
  - File movement / stage velocity: funnel with bottleneck highlighting
  - Source/partner table: ranked by volume, conversion, accrued payout
  - Attention panel (right sidebar): action items by urgency
- `/today` — Today view:
  - Tasks due today
  - Overdue tasks
  - Stuck cases
  - Expiring documents
  - Follow-ups due
- `/analytics` — KPI detail page with filters
- `/reports` — Report builder with export

### Components
- `KPIStrip` — horizontal row of metric cards with trend indicators
- `PipelineChart` — horizontal bar chart by case status
- `CommissionChart` — bar chart, expected vs settled by month
- `StageVelocity` — funnel view with count, average time, bottleneck flag
- `SourceTable` — ranked table with performance metrics
- `AttentionPanel` — prioritized action item list
- `TodayCard` — compact card for due/overdue items
- `ReportExportButton` — permission-gated export with format selection

## Business Rules

- All metrics computed from real data — never faked or mocked
- Field Executive sees only own performance metrics
- KPI formulas exactly as specified in PRD 9.1
- Date range filters apply to all dashboard sections
- Export creates audit record
- Export restricted to Owner, Manager, Accountant

## Security Implications

- Dashboard queries must respect RLS (tenant isolation)
- Field Executive scoping on all metrics
- Export audit trail
- No PII in exported summaries (aggregate data only, unless case export)

## Tests

- Pipeline counts match actual case statuses
- KPI formulas produce correct results against known test data
- Stuck case count matches cases where ageing > SLA
- Today view shows correct due/overdue items
- Source report aggregates correctly
- Field Executive sees only own metrics
- Export generates valid CSV
- Export creates audit record
- Date range filtering works correctly
- Dashboard reflects data changes on page reload

## Acceptance Criteria

1. Business overview dashboard shows real pipeline and payout metrics
2. Today view shows due, overdue, and stuck items
3. KPIs computed per PRD 9.1 formulas
4. Source report shows per-source performance
5. Date range filters work across all panels
6. CSV export works with audit logging
7. Field Executive sees only own performance
8. Dashboard loads within 3 seconds (NFR-PRF-002)

## Definition of Done

- [ ] Business overview dashboard operational with real data
- [ ] Today view complete
- [ ] All KPIs computed correctly
- [ ] Source report functional
- [ ] CSV/Excel export with permissions and audit
- [ ] Field Executive scoping enforced
- [ ] Performance within 3-second target
- [ ] Tests passing

## Risks

- Dashboard query performance with large datasets — may need materialized views
- KPI formula edge cases (division by zero, empty periods)
- Chart rendering performance on mobile

## Files Expected to Change/Create

```
backend/app/modules/reports/
  __init__.py, router.py, dashboard_service.py, kpi_service.py,
  source_report_service.py, today_service.py, export_service.py
backend/tests/test_dashboard.py, test_kpis.py, test_source_report.py, test_export.py

frontend/src/features/dashboard/
  DashboardPage.tsx, KPIStrip.tsx, PipelineChart.tsx, CommissionChart.tsx,
  StageVelocity.tsx, SourceTable.tsx, AttentionPanel.tsx,
  TodayPage.tsx, TodayCard.tsx
frontend/src/features/reports/
  AnalyticsPage.tsx, ReportExportButton.tsx
```
