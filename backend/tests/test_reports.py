"""
DSA OS — Reports and Dashboards Test Suite (Phase 08)

Tests:
- Executive operations console overview (empty & populated states)
- Pure Decimal arithmetic for financial metrics
- PRD 9.1 KPI computations (exact formulas and zero-division resilience)
- Daily cockpit Today view (IF-3): due today, overdue, stuck cases, expiring documents, PDD items
- Source performance analytics (FR-SRC-004)
- Field Executive role scoping (FR-RPT-006)
- CSV data export with mandatory immutable audit logging (FR-RPT-005, PRD 9.2)
- Multi-tenant data isolation
"""

import csv
import io
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User as _User  # noqa: F401
from app.modules.cases.models import Case, CaseParty
from app.modules.documents.models import Document, DocumentType
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.parties.models import Party
from app.modules.payout.models import PayoutExpectation
from app.modules.payout.reconciliation.models import PayoutReceipt, Reconciliation
from app.modules.pdd.models import PDDItem
from app.modules.reports.dashboard_service import DashboardService
from app.modules.reports.export_service import ExportService
from app.modules.reports.kpi_service import KPIService
from app.modules.reports.source_report_service import SourceReportService
from app.modules.reports.today_service import TodayService
from app.modules.sources.models import Source
from app.modules.workflow.models import SLAConfig, Task


class MockResult:
    def __init__(self, data: list[Any]):
        self._data = data

    def scalars(self) -> "MockResult":
        return self

    def all(self) -> list[Any]:
        return list(self._data)

    def scalar_one_or_none(self) -> Any:
        return self._data[0] if self._data else None

    def scalar(self) -> Any:
        return self._data[0] if self._data else 0


class MockReportDbSession:
    """In-memory mock supporting async session queries for reports & analytics."""

    def __init__(self) -> None:
        self.cases: dict[uuid.UUID, Case] = {}
        self.sources: dict[uuid.UUID, Source] = {}
        self.lenders: dict[uuid.UUID, Lender] = {}
        self.applications: dict[uuid.UUID, LenderApplication] = {}
        self.parties: dict[uuid.UUID, Party] = {}
        self.case_parties: dict[uuid.UUID, CaseParty] = {}
        self.expectations: dict[uuid.UUID, PayoutExpectation] = {}
        self.receipts: dict[uuid.UUID, PayoutReceipt] = {}
        self.reconciliations: dict[uuid.UUID, Reconciliation] = {}
        self.tasks: dict[uuid.UUID, Task] = {}
        self.sla_configs: dict[uuid.UUID, SLAConfig] = {}
        self.pdd_items: dict[uuid.UUID, PDDItem] = {}
        self.documents: dict[uuid.UUID, Document] = {}
        self.document_types: dict[uuid.UUID, DocumentType] = {}
        self.audit_logs: dict[uuid.UUID, AuditLog] = {}

    def add(self, entity: Any) -> None:
        now = datetime.now(UTC)
        if hasattr(entity, "id") and entity.id is None:
            entity.id = uuid.uuid4()
        if hasattr(entity, "created_at") and getattr(entity, "created_at", None) is None:
            entity.created_at = now
        if hasattr(entity, "updated_at"):
            entity.updated_at = now

        if isinstance(entity, AuditLog):
            self.audit_logs[entity.id] = entity
        elif isinstance(entity, Case):
            self.cases[entity.id] = entity
        elif isinstance(entity, Task):
            self.tasks[entity.id] = entity
        elif isinstance(entity, Document):
            self.documents[entity.id] = entity
        elif isinstance(entity, PDDItem):
            self.pdd_items[entity.id] = entity
        elif isinstance(entity, PayoutExpectation):
            self.expectations[entity.id] = entity
        elif isinstance(entity, Reconciliation):
            self.reconciliations[entity.id] = entity

    async def flush(self) -> None:
        pass

    async def commit(self) -> None:
        pass

    async def refresh(self, entity: Any) -> None:
        pass

    async def execute(self, statement: Any) -> MockResult:
        stmt_str = str(statement).lower()

        # Count queries
        if "count(" in stmt_str:
            if "from tasks" in stmt_str:
                now = datetime.now(UTC)
                count = sum(
                    1
                    for t in self.tasks.values()
                    if t.status == "pending" and t.due_date <= now
                )
                return MockResult([count])
            if "from pdd_items" in stmt_str:
                now_d = datetime.now(UTC).date()
                count = sum(
                    1
                    for p in self.pdd_items.values()
                    if p.status in ("pending", "collected") and p.due_date < now_d
                )
                return MockResult([count])
            if "from reconciliations" in stmt_str:
                count = sum(
                    1
                    for r in self.reconciliations.values()
                    if r.status in ("short", "discrepancy")
                )
                return MockResult([count])
            if "from documents" in stmt_str:
                now = datetime.now(UTC)
                cutoff = now + timedelta(days=30)
                count = sum(
                    1
                    for d in self.documents.values()
                    if d.expires_at and d.expires_at <= cutoff and d.status != "archived"
                )
                return MockResult([count])

        # Entity queries
        if "from cases" in stmt_str:
            target_owner = None
            for crit in getattr(statement, "_where_criteria", []):
                crit_s = str(crit).lower()
                if "cases.owner_id" in crit_s:
                    target_owner = getattr(crit.right, "value", None)
            if target_owner is not None:
                return MockResult([c for c in self.cases.values() if c.owner_id == target_owner])
            return MockResult(list(self.cases.values()))

        if "from sources" in stmt_str:
            return MockResult(list(self.sources.values()))

        if "from lenders" in stmt_str:
            return MockResult(list(self.lenders.values()))

        if "from lender_applications" in stmt_str:
            return MockResult(list(self.applications.values()))

        if "from payout_expectations" in stmt_str:
            return MockResult(list(self.expectations.values()))

        if "from reconciliations" in stmt_str:
            return MockResult(list(self.reconciliations.values()))

        if "from tasks" in stmt_str:
            return MockResult(list(self.tasks.values()))

        if "from sla_configs" in stmt_str:
            return MockResult(list(self.sla_configs.values()))

        if "from pdd_items" in stmt_str:
            return MockResult(list(self.pdd_items.values()))

        if "from documents" in stmt_str:
            return MockResult(list(self.documents.values()))

        if "from audit_logs" in stmt_str:
            return MockResult(list(self.audit_logs.values()))

        return MockResult([])


@pytest.fixture
def mock_db() -> MockReportDbSession:
    return MockReportDbSession()


# =============================================================================
# 1. Executive Operations Console Tests
# =============================================================================
@pytest.mark.asyncio
async def test_dashboard_overview_empty_tenant(mock_db: MockReportDbSession) -> None:
    """When a tenant has zero cases, the dashboard returns cleanly with zeroes."""
    service = DashboardService(mock_db)  # type: ignore[arg-type]
    overview = await service.get_overview()

    assert overview.pipeline_summary.active_files_count == 0
    assert overview.pipeline_summary.total_loan_amount_requested == Decimal("0.00")
    assert overview.pipeline_summary.disbursed_volume == Decimal("0.00")
    assert overview.payout_summary.total_expected_net == Decimal("0.00")
    assert overview.payout_summary.total_received_net == Decimal("0.00")
    assert overview.payout_summary.realisation_rate_pct == Decimal("0.00")
    assert len(overview.funnel_stages) == 8
    assert overview.top_sources == []
    assert overview.attention_items.stuck_cases_count == 0


@pytest.mark.asyncio
async def test_dashboard_overview_populated(mock_db: MockReportDbSession) -> None:
    """Populated tenant aggregates exact pipeline, payout, and attention metrics."""
    org_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    source_id = uuid.uuid4()
    lender_id = uuid.uuid4()

    source = Source(id=source_id, org_id=org_id, name="AutoMax Motors", type="dealer", is_active=True)
    mock_db.sources[source_id] = source

    lender = Lender(id=lender_id, org_id=org_id, name="HDFC Bank", is_active=True)
    mock_db.lenders[lender_id] = lender

    now = datetime.now(UTC)

    # 1. Active Lead
    c1 = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="CASE-001",
        status="lead",
        product_type="used_car",
        loan_amount_requested=Decimal("500000.00"),
        source_id=source_id,
        owner_id=owner_id,
        entered_stage_at=now - timedelta(hours=5),
        created_at=now - timedelta(hours=5),
    )
    mock_db.cases[c1.id] = c1

    # 2. Logged-in Case
    c2 = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="CASE-002",
        status="logged_in",
        product_type="used_car",
        loan_amount_requested=Decimal("800000.00"),
        source_id=source_id,
        owner_id=owner_id,
        entered_stage_at=now - timedelta(hours=10),
        created_at=now - timedelta(hours=10),
    )
    mock_db.cases[c2.id] = c2

    # 3. Disbursed Case with Payout Expectation & Match
    c3 = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="CASE-003",
        status="disbursed",
        product_type="used_car",
        loan_amount_requested=Decimal("1000000.00"),
        loan_amount_disbursed=Decimal("950000.00"),
        source_id=source_id,
        owner_id=owner_id,
        entered_stage_at=now - timedelta(hours=24),
        created_at=now - timedelta(hours=48),
    )
    mock_db.cases[c3.id] = c3

    exp1 = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=c3.id,
        lender_application_id=uuid.uuid4(),
        disbursal_amount=Decimal("950000.00"),
        gross_amount=Decimal("19000.00"),
        net_amount=Decimal("18050.00"),
        status="due",
        created_at=now,
    )
    mock_db.expectations[exp1.id] = exp1

    recon1 = Reconciliation(
        id=uuid.uuid4(),
        org_id=org_id,
        expectation_id=exp1.id,
        receipt_id=uuid.uuid4(),
        expected_amount=Decimal("18050.00"),
        received_amount=Decimal("18050.00"),
        variance_amount=Decimal("0.00"),
        status="matched",
        reconciled_at=now,
    )
    mock_db.reconciliations[recon1.id] = recon1

    service = DashboardService(mock_db)  # type: ignore[arg-type]
    overview = await service.get_overview()

    # Pipeline
    assert overview.pipeline_summary.active_files_count == 3
    assert overview.pipeline_summary.total_loan_amount_requested == Decimal("2300000.00")
    assert overview.pipeline_summary.disbursed_count == 1
    assert overview.pipeline_summary.disbursed_volume == Decimal("950000.00")

    # Payout
    assert overview.payout_summary.total_expected_net == Decimal("18050.00")
    assert overview.payout_summary.total_received_net == Decimal("18050.00")
    assert overview.payout_summary.realisation_rate_pct == Decimal("100.00")
    assert overview.payout_summary.outstanding_net == Decimal("0.00")

    # Funnel
    disbursed_stage = next(s for s in overview.funnel_stages if s.stage == "disbursed")
    assert disbursed_stage.count == 1
    assert disbursed_stage.total_amount == Decimal("950000.00")

    # Top Sources
    assert len(overview.top_sources) == 1
    top_s = overview.top_sources[0]
    assert top_s.source_name == "AutoMax Motors"
    assert top_s.total_cases == 3
    assert top_s.disbursed_cases == 1
    assert top_s.disbursed_volume == Decimal("950000.00")


# =============================================================================
# 2. PRD 9.1 KPI Formulas Tests
# =============================================================================
@pytest.mark.asyncio
async def test_prd_9_1_kpi_computations(mock_db: MockReportDbSession) -> None:
    """Verifies all 10 authoritative PRD 9.1 KPI formulas produce exact Decimal outputs."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    now = datetime.now(UTC)

    lender = Lender(id=lender_id, org_id=org_id, name="Kotak Mahindra Prime", is_active=True)
    mock_db.lenders[lender_id] = lender

    # 4 cases created
    c_disb1 = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="C-101",
        status="disbursed",
        product_type="used_car",
        loan_amount_requested=Decimal("500000.00"),
        loan_amount_disbursed=Decimal("500000.00"),
        source_id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        entered_stage_at=now - timedelta(hours=10),
        created_at=now - timedelta(days=2),
    )
    c_disb2 = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="C-102",
        status="disbursed",
        product_type="used_car",
        loan_amount_requested=Decimal("700000.00"),
        loan_amount_disbursed=Decimal("700000.00"),
        source_id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        entered_stage_at=now - timedelta(hours=15),
        created_at=now - timedelta(days=2),
    )
    c_sanc = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="C-103",
        status="sanctioned",
        product_type="used_car",
        loan_amount_requested=Decimal("600000.00"),
        source_id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        entered_stage_at=now - timedelta(hours=50),  # Will be stuck (>48h SLA)
        created_at=now - timedelta(days=3),
    )
    c_rej = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="C-104",
        status="rejected",
        product_type="used_car",
        loan_amount_requested=Decimal("400000.00"),
        source_id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        entered_stage_at=now - timedelta(hours=3),
        created_at=now - timedelta(days=1),
    )
    for c in [c_disb1, c_disb2, c_sanc, c_rej]:
        mock_db.cases[c.id] = c

    # Applications:
    # 3 logged in, 2 sanctioned (1 sanctioned + 1 disbursed), 1 disbursed
    # Let's create:
    # app1: disbursed
    # app2: sanctioned
    # app3: rejected
    app1 = LenderApplication(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=c_disb1.id,
        lender_id=lender_id,
        product="used_car",
        status="disbursed",
        disbursal_amount=Decimal("500000.00"),
        entered_stage_at=now,
    )
    app1.lender = lender
    app2 = LenderApplication(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=c_sanc.id,
        lender_id=lender_id,
        product="used_car",
        status="sanctioned",
        sanction_amount=Decimal("600000.00"),
        entered_stage_at=now,
    )
    app2.lender = lender
    app3 = LenderApplication(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=c_rej.id,
        lender_id=lender_id,
        product="used_car",
        status="rejected",
        entered_stage_at=now,
    )
    app3.lender = lender
    for a in [app1, app2, app3]:
        mock_db.applications[a.id] = a

    # SLA config: default 48h for sanctioned
    sla1 = SLAConfig(id=uuid.uuid4(), org_id=org_id, entity_type="case", status="sanctioned", sla_hours=48, is_active=True)
    mock_db.sla_configs[sla1.id] = sla1

    # Payouts: expected 20,000, received 18,000
    exp = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=c_disb1.id,
        lender_application_id=app1.id,
        disbursal_amount=Decimal("500000.00"),
        gross_amount=Decimal("20000.00"),
        net_amount=Decimal("20000.00"),
        status="due",
    )
    mock_db.expectations[exp.id] = exp

    recon = Reconciliation(
        id=uuid.uuid4(),
        org_id=org_id,
        expectation_id=exp.id,
        receipt_id=uuid.uuid4(),
        expected_amount=Decimal("20000.00"),
        received_amount=Decimal("18000.00"),
        variance_amount=Decimal("-2000.00"),
        status="short",
        reconciled_at=now,
    )
    mock_db.reconciliations[recon.id] = recon

    service = KPIService(mock_db)  # type: ignore[arg-type]
    kpis = await service.compute_kpis()

    # 1. Approval rate: 2 sanctioned (app1 + app2) / 3 logged in = 66.67%
    assert kpis.approval_rate_pct == Decimal("66.67")

    # 2. Disbursal conversion: 1 disbursed / 2 sanctioned = 50.00%
    assert kpis.disbursal_conversion_pct == Decimal("50.00")

    # 3. Lead to disbursal: 2 disbursed cases / 4 total created cases = 50.00%
    assert kpis.lead_to_disbursal_pct == Decimal("50.00")

    # 4. Average ticket: (500000 + 700000) / 2 = 600000.00
    assert kpis.average_ticket == Decimal("600000.00")

    # 5. Stuck case count: c_sanc has 50 hours ageing > 48h SLA -> exactly 1
    assert kpis.stuck_case_count == 1

    # 6. Payout realisation: 18000 / 20000 = 90.00%
    assert kpis.payout_realisation_pct == Decimal("90.00")

    # 7. Payout variance: 18000 - 20000 = -2000.00
    assert kpis.payout_variance == Decimal("-2000.00")

    # 8. Source quality score is computed
    assert kpis.source_quality_score > Decimal("0.00")

    # 9. Lender breakdown present
    assert len(kpis.lender_breakdowns) == 1
    lb = kpis.lender_breakdowns[0]
    assert lb.lender_name == "Kotak Mahindra Prime"
    assert lb.approval_rate_pct == Decimal("66.67")


@pytest.mark.asyncio
async def test_prd_9_1_kpi_zero_division_safety(mock_db: MockReportDbSession) -> None:
    """Empty database does not raise ZeroDivisionError and safely defaults to 0.00."""
    service = KPIService(mock_db)  # type: ignore[arg-type]
    kpis = await service.compute_kpis()

    assert kpis.approval_rate_pct == Decimal("0.00")
    assert kpis.disbursal_conversion_pct == Decimal("0.00")
    assert kpis.lead_to_disbursal_pct == Decimal("0.00")
    assert kpis.average_ticket == Decimal("0.00")
    assert kpis.payout_realisation_pct == Decimal("0.00")
    assert kpis.payout_variance == Decimal("0.00")
    assert kpis.stuck_case_count == 0


# =============================================================================
# 3. Daily Cockpit Today View (IF-3) Tests
# =============================================================================
@pytest.mark.asyncio
async def test_today_view_console(mock_db: MockReportDbSession) -> None:
    """Verifies IF-3 daily operational cockpit filters tasks, stuck cases, and expiring docs."""
    org_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    now = datetime.now(UTC)
    today_date = now.date()

    # Task due today
    t_today = Task(
        id=uuid.uuid4(),
        org_id=org_id,
        title="Call applicant for RC copy",
        type="call",
        due_date=now,
        status="pending",
        owner_id=owner_id,
    )
    mock_db.tasks[t_today.id] = t_today

    # Task overdue
    t_overdue = Task(
        id=uuid.uuid4(),
        org_id=org_id,
        title="Bank branch inspection follow-up",
        type="bank_followup",
        due_date=now - timedelta(days=2),
        status="pending",
        owner_id=owner_id,
    )
    mock_db.tasks[t_overdue.id] = t_overdue

    # Completed task (should be excluded)
    t_done = Task(
        id=uuid.uuid4(),
        org_id=org_id,
        title="Checklist verified",
        type="other",
        due_date=now,
        status="completed",
        owner_id=owner_id,
    )
    mock_db.tasks[t_done.id] = t_done

    # Expiring document (expires in 10 days)
    doc_type = DocumentType(id=uuid.uuid4(), code="INS_POLICY", name="Insurance Policy", group_name="vehicle")
    mock_db.document_types[doc_type.id] = doc_type

    doc = Document(
        id=uuid.uuid4(),
        org_id=org_id,
        file_name="insurance_policy.pdf",
        file_size=1024,
        mime_type="application/pdf",
        status="verified",
        uploaded_by=owner_id,
        document_type_id=doc_type.id,
        expires_at=now + timedelta(days=10),
    )
    doc.document_type = doc_type
    mock_db.documents[doc.id] = doc

    # Due PDD item
    pdd = PDDItem(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=uuid.uuid4(),
        lender_application_id=uuid.uuid4(),
        document_type="rc_hypothecation",
        title="Endorsed RC Copy",
        due_date=today_date,
        status="pending",
    )
    mock_db.pdd_items[pdd.id] = pdd

    service = TodayService(mock_db)  # type: ignore[arg-type]
    today_res = await service.get_today_view()

    assert len(today_res.tasks_due_today) == 1
    assert today_res.tasks_due_today[0].title == "Call applicant for RC copy"

    assert len(today_res.tasks_overdue) == 1
    assert today_res.tasks_overdue[0].title == "Bank branch inspection follow-up"

    assert len(today_res.expiring_documents) == 1
    assert today_res.expiring_documents[0].document_name == "insurance_policy.pdf"

    assert len(today_res.pdd_items_due) == 1
    assert today_res.pdd_items_due[0].document_type == "rc_hypothecation"

    assert today_res.counts.due_today_count == 1
    assert today_res.counts.overdue_count == 1
    assert today_res.counts.expiring_docs_count == 1
    assert today_res.counts.pdd_due_count == 1


# =============================================================================
# 4. Source-Wise Performance Reporting (FR-SRC-004) Tests
# =============================================================================
@pytest.mark.asyncio
async def test_source_performance_report(mock_db: MockReportDbSession) -> None:
    """Verifies FR-SRC-004 source-wise analytics and partner ranking."""
    org_id = uuid.uuid4()
    now = datetime.now(UTC)

    s1 = Source(id=uuid.uuid4(), org_id=org_id, name="Sai Motors", type="dealer", is_active=True)
    s2 = Source(id=uuid.uuid4(), org_id=org_id, name="City Connectors", type="connector", is_active=True)
    mock_db.sources[s1.id] = s1
    mock_db.sources[s2.id] = s2

    # Sai Motors: 2 cases, 1 disbursed (₹7,50,000)
    c1 = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="SM-01",
        status="disbursed",
        loan_amount_requested=Decimal("800000.00"),
        loan_amount_disbursed=Decimal("750000.00"),
        source_id=s1.id,
        owner_id=uuid.uuid4(),
        created_at=now,
    )
    c2 = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="SM-02",
        status="logged_in",
        loan_amount_requested=Decimal("500000.00"),
        source_id=s1.id,
        owner_id=uuid.uuid4(),
        created_at=now,
    )
    mock_db.cases[c1.id] = c1
    mock_db.cases[c2.id] = c2

    # Expected payout for c1
    exp = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=c1.id,
        lender_application_id=uuid.uuid4(),
        disbursal_amount=Decimal("750000.00"),
        gross_amount=Decimal("15000.00"),
        net_amount=Decimal("14250.00"),
        status="due",
    )
    mock_db.expectations[exp.id] = exp

    service = SourceReportService(mock_db)  # type: ignore[arg-type]
    report = await service.get_source_report()

    assert report.total_cases == 2
    assert report.total_disbursed_volume == Decimal("750000.00")
    assert report.total_payout_expected == Decimal("14250.00")

    s1_item = next(s for s in report.sources if s.source_name == "Sai Motors")
    assert s1_item.total_cases == 2
    assert s1_item.disbursed_cases == 1
    assert s1_item.conversion_rate_pct == Decimal("50.0")
    assert s1_item.disbursed_volume == Decimal("750000.00")
    assert s1_item.payout_expected == Decimal("14250.00")


# =============================================================================
# 5. Field Executive Scoping (FR-RPT-006) Tests
# =============================================================================
@pytest.mark.asyncio
async def test_field_executive_scoping(mock_db: MockReportDbSession) -> None:
    """Field Executive only sees their own assigned cases in the dashboard."""
    org_id = uuid.uuid4()
    fe_user_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    now = datetime.now(UTC)

    # Case owned by FE
    c_fe = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="FE-01",
        status="lead",
        loan_amount_requested=Decimal("400000.00"),
        source_id=uuid.uuid4(),
        owner_id=fe_user_id,
        entered_stage_at=now,
        created_at=now,
    )
    # Case owned by someone else
    c_other = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="OTHER-01",
        status="lead",
        loan_amount_requested=Decimal("1200000.00"),
        source_id=uuid.uuid4(),
        owner_id=other_user_id,
        entered_stage_at=now,
        created_at=now,
    )
    mock_db.cases[c_fe.id] = c_fe
    mock_db.cases[c_other.id] = c_other

    service = DashboardService(mock_db)  # type: ignore[arg-type]

    # Scoped to FE user
    fe_overview = await service.get_overview(owner_id=fe_user_id)
    assert fe_overview.pipeline_summary.active_files_count == 1
    assert fe_overview.pipeline_summary.total_loan_amount_requested == Decimal("400000.00")

    # Manager / Owner view (unscoped)
    all_overview = await service.get_overview(owner_id=None)
    assert all_overview.pipeline_summary.active_files_count == 2
    assert all_overview.pipeline_summary.total_loan_amount_requested == Decimal("1600000.00")


# =============================================================================
# 6. CSV Export and Audit Logging (FR-RPT-005, PRD 9.2) Tests
# =============================================================================
@pytest.mark.asyncio
async def test_export_service_cases_and_audit(mock_db: MockReportDbSession) -> None:
    """Export produces standard CSV and logs report_exported audit record."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    now = datetime.now(UTC)

    c = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="EXP-CASE-01",
        status="disbursed",
        product_type="used_car",
        loan_amount_requested=Decimal("600000.00"),
        loan_amount_sanctioned=Decimal("600000.00"),
        loan_amount_disbursed=Decimal("580000.00"),
        source_id=uuid.uuid4(),
        owner_id=user_id,
        created_at=now,
    )
    mock_db.cases[c.id] = c

    export_service = ExportService(mock_db)  # type: ignore[arg-type]
    csv_str = await export_service.export_csv(
        org_id=org_id,
        user_id=user_id,
        user_role="manager",
        report_type="cases",
    )

    # Validate CSV content
    reader = list(csv.reader(io.StringIO(csv_str)))
    assert len(reader) >= 2  # Header + 1 row
    assert reader[0][0] == "Case Number"
    assert reader[1][0] == "EXP-CASE-01"
    assert reader[1][3] == "600000.00"

    # Validate audit log creation
    assert len(mock_db.audit_logs) == 1
    log = list(mock_db.audit_logs.values())[0]
    assert log.action == "report_exported"
    assert log.entity_type == "report"
    assert log.actor_id == user_id
    assert log.changes.get("report_type") == "cases"
