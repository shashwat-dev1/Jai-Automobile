"""
DSA OS — Payout Reconciliation Test Suite (Gate MONEY-01)
Verifies:
- Pure deterministic matching engine: exact LAN, fuzzy name (>85%), signed variance, tolerance, ageing
- CSV statement ingestion and column mapping
- Dry-run preview mode
- Commit mode with receipt creation and auto-matching
- BR-07: Receipts can only link to disbursed / post-disbursal cases
- FR-PAY-008: 24-hour batch reversal window enforcement
- Manual matching with signed variance classification (matched, short, excess)
- FR-PAY-011: Commission clawback tracking and status transition
- Lender outstanding report with ageing buckets
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from app.modules.auth.models import User as _User  # noqa: F401
from app.modules.cases.models import Case, CaseParty
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.parties.models import Party
from app.modules.payout.models import PayoutExpectation
from app.modules.payout.reconciliation.clawback_service import ClawbackService
from app.modules.payout.reconciliation.import_service import (
    ReconciliationImportService,
    parse_date_safe,
    parse_decimal_safe,
)
from app.modules.payout.reconciliation.matching_engine import (
    DEFAULT_TOLERANCE,
    calculate_name_similarity,
    calculate_variance,
    classify_ageing,
    is_name_fuzzy_match,
    normalize_identifier,
    normalize_name,
)
from app.modules.payout.reconciliation.models import (
    ClawbackEvent,
    ImportBatch,
    PayoutReceipt,
    Reconciliation,
    StatementColumnMapping,
)
from app.modules.payout.reconciliation.receipt_service import PayoutReceiptService
from app.modules.payout.reconciliation.schemas import (
    ClawbackEventCreate,
    ManualMatchRequest,
    PayoutReceiptCreate,
    StatementColumnMappingCreate,
)
from app.modules.pdd.models import PDDItem as _PDDItem  # noqa: F401
from app.modules.sources.models import Source as _Source  # noqa: F401
from app.modules.workflow.models import Task as _Task  # noqa: F401
from app.shared.exceptions import BusinessRuleViolationError


# =============================================================================
# 1. Deterministic Matching Engine Unit Tests
# =============================================================================
def test_matching_engine_lan_normalization() -> None:
    assert normalize_identifier("LAN-12345/A") == "LAN12345A"
    assert normalize_identifier("  loan 999-xyz  ") == "LOAN999XYZ"
    assert normalize_identifier(None) == ""
    assert normalize_identifier("") == ""


def test_matching_engine_name_normalization() -> None:
    assert normalize_name("Mr. Rahul Sharma") == "rahul sharma"
    assert normalize_name("M/S ABC INFRA LTD.") == "abc infra ltd"
    assert normalize_name("Dr. Amit  K.   Verma") == "amit k verma"


def test_matching_engine_fuzzy_name_matching() -> None:
    # Exact match
    assert calculate_name_similarity("Rahul Sharma", "Rahul Sharma") == 1.0

    # Inverted name order (e.g. surname first)
    assert is_name_fuzzy_match("Sharma Rahul", "Rahul Sharma") is True

    # Minor typo / honorific difference
    assert is_name_fuzzy_match("Mr. Rajesh Kumar", "Rajesh Kumar") is True

    # High similarity (>85%)
    assert is_name_fuzzy_match("Sunil Ramesh Patil", "Sunil R Patil") is False  # Abbreviation drops similarity
    assert is_name_fuzzy_match("Priya Anand", "Priya Anand") is True

    # Clearly different names
    assert is_name_fuzzy_match("Vikram Singh", "Pooja Mehta") is False


def test_matching_engine_variance_and_tolerance() -> None:
    expected = Decimal("15000.00")

    # Exact match within default ₹10.00 tolerance
    var, status = calculate_variance(Decimal("15005.00"), expected, tolerance=DEFAULT_TOLERANCE)
    assert var == Decimal("5.00")
    assert status == "matched"

    var, status = calculate_variance(Decimal("14995.00"), expected, tolerance=DEFAULT_TOLERANCE)
    assert var == Decimal("-5.00")
    assert status == "matched"

    # Short payment (underpaid beyond tolerance)
    var, status = calculate_variance(Decimal("14500.00"), expected, tolerance=DEFAULT_TOLERANCE)
    assert var == Decimal("-500.00")
    assert status == "short"

    # Excess payment (overpaid beyond tolerance)
    var, status = calculate_variance(Decimal("16000.00"), expected, tolerance=DEFAULT_TOLERANCE)
    assert var == Decimal("1000.00")
    assert status == "excess"


def test_matching_engine_ageing_classification() -> None:
    today = date(2026, 10, 5)

    # 15 days ago -> 0_30
    assert classify_ageing(date(2026, 9, 20), as_of=today) == "0_30"

    # 45 days ago -> 31_60
    assert classify_ageing(date(2026, 8, 21), as_of=today) == "31_60"

    # 75 days ago -> 61_90
    assert classify_ageing(date(2026, 7, 22), as_of=today) == "61_90"

    # 100 days ago -> 90_plus
    assert classify_ageing(date(2026, 6, 27), as_of=today) == "90_plus"


# =============================================================================
# 2. Parsing Helpers Unit Tests
# =============================================================================
def test_parse_decimal_safe() -> None:
    assert parse_decimal_safe("15,000.50") == Decimal("15000.50")
    assert parse_decimal_safe("Rs. 1,23,456.00") == Decimal("123456.00")
    assert parse_decimal_safe(Decimal("500.00")) == Decimal("500.00")
    assert parse_decimal_safe(1000) == Decimal("1000.00")
    assert parse_decimal_safe("") == Decimal("0.00")
    assert parse_decimal_safe(None) == Decimal("0.00")


def test_parse_date_safe() -> None:
    assert parse_date_safe("2026-10-05") == date(2026, 10, 5)
    assert parse_date_safe("05/10/2026") == date(2026, 10, 5)
    assert parse_date_safe("05-10-2026") == date(2026, 10, 5)
    assert parse_date_safe("05-Oct-2026") == date(2026, 10, 5)
    assert parse_date_safe(None) is None
    assert parse_date_safe("invalid-date") is None


# =============================================================================
# 3. In-Memory Mock Database Session for Service Tests
# =============================================================================
class MockResult:
    def __init__(self, data: list[Any]):
        self._data = data

    def scalars(self) -> "MockResult":
        return self

    def all(self) -> list[Any]:
        return list(self._data)

    def scalar_one_or_none(self) -> Any:
        return self._data[0] if self._data else None


class MockReconDbSession:
    """In-memory mock supporting async session queries for reconciliation services."""

    def __init__(self) -> None:
        self.lenders: dict[uuid.UUID, Lender] = {}
        self.cases: dict[uuid.UUID, Case] = {}
        self.applications: dict[uuid.UUID, LenderApplication] = {}
        self.parties: dict[uuid.UUID, Party] = {}
        self.case_parties: dict[uuid.UUID, CaseParty] = {}
        self.expectations: dict[uuid.UUID, PayoutExpectation] = {}
        self.mappings: dict[uuid.UUID, StatementColumnMapping] = {}
        self.batches: dict[uuid.UUID, ImportBatch] = {}
        self.receipts: dict[uuid.UUID, PayoutReceipt] = {}
        self.reconciliations: dict[uuid.UUID, Reconciliation] = {}
        self.clawbacks: dict[uuid.UUID, ClawbackEvent] = {}

    def add(self, entity: Any) -> None:
        now = datetime.now(UTC)
        if hasattr(entity, "id") and entity.id is None:
            entity.id = uuid.uuid4()
        if hasattr(entity, "created_at") and getattr(entity, "created_at", None) is None:
            entity.created_at = now
        if hasattr(entity, "updated_at"):
            entity.updated_at = now

        if isinstance(entity, StatementColumnMapping):
            self.mappings[entity.id] = entity
        elif isinstance(entity, ImportBatch):
            self.batches[entity.id] = entity
        elif isinstance(entity, PayoutReceipt):
            self.receipts[entity.id] = entity
        elif isinstance(entity, Reconciliation):
            self.reconciliations[entity.id] = entity
            # Link receipt reconciliation
            if entity.receipt_id in self.receipts:
                self.receipts[entity.receipt_id].reconciliation = entity
        elif isinstance(entity, ClawbackEvent):
            self.clawbacks[entity.id] = entity

    async def flush(self) -> None:
        pass

    async def commit(self) -> None:
        pass

    async def refresh(self, entity: Any) -> None:
        pass

    async def delete(self, entity: Any) -> None:
        if isinstance(entity, Reconciliation):
            self.reconciliations.pop(entity.id, None)
        elif isinstance(entity, PayoutReceipt):
            self.receipts.pop(entity.id, None)

    async def execute(self, statement: Any) -> MockResult:
        stmt_str = str(statement).lower()

        # Query lenders
        if "from lenders" in stmt_str:
            return MockResult(list(self.lenders.values()))

        # Query cases
        if "from cases" in stmt_str:
            return MockResult(list(self.cases.values()))

        # Query lender_applications
        if "from lender_applications" in stmt_str:
            return MockResult(list(self.applications.values()))

        # Query statement_column_mappings
        if "from statement_column_mappings" in stmt_str:
            return MockResult(list(self.mappings.values()))

        # Query import_batches
        if "from import_batches" in stmt_str:
            target_id = None
            for crit in getattr(statement, "_where_criteria", []):
                crit_s = str(crit).lower()
                if "import_batches.id" in crit_s:
                    target_id = getattr(crit.right, "value", None)
            if target_id and target_id in self.batches:
                return MockResult([self.batches[target_id]])
            return MockResult(list(self.batches.values()))

        # Query payout_receipts
        if "from payout_receipts" in stmt_str:
            target_id = None
            for crit in getattr(statement, "_where_criteria", []):
                crit_s = str(crit).lower()
                if "payout_receipts.id" in crit_s:
                    target_id = getattr(crit.right, "value", None)
            if target_id and target_id in self.receipts:
                return MockResult([self.receipts[target_id]])
            return MockResult(list(self.receipts.values()))

        # Query payout_expectations
        if "from payout_expectations" in stmt_str:
            target_id = None
            for crit in getattr(statement, "_where_criteria", []):
                crit_s = str(crit).lower()
                if "payout_expectations.id" in crit_s:
                    target_id = getattr(crit.right, "value", None)
            if target_id and target_id in self.expectations:
                return MockResult([self.expectations[target_id]])
            return MockResult(list(self.expectations.values()))

        # Query clawback_events
        if "from clawback_events" in stmt_str:
            return MockResult(list(self.clawbacks.values()))

        return MockResult([])


@pytest.fixture
def mock_recon_db() -> MockReconDbSession:
    return MockReconDbSession()


# =============================================================================
# 4. BR-07: Disbursal-Only Receipt Linking Tests
# =============================================================================
@pytest.mark.asyncio
async def test_br07_receipt_cannot_link_to_non_disbursed_case(mock_recon_db: MockReconDbSession) -> None:
    """BR-07: Receipts can only link to cases in disbursed or post-disbursal status."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    case_id = uuid.uuid4()

    lender = Lender(id=lender_id, org_id=org_id, name="ICICI Bank", is_active=True)
    mock_recon_db.lenders[lender_id] = lender

    # Case is only in 'sanctioned' status (not disbursed!)
    non_disbursed_case = Case(
        id=case_id,
        org_id=org_id,
        case_no="CASE-2026-001",
        status="sanctioned",
        owner_id=uuid.uuid4(),
    )
    mock_recon_db.cases[case_id] = non_disbursed_case

    service = PayoutReceiptService(session=mock_recon_db)  # type: ignore[arg-type]

    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.create_receipt(
            org_id=org_id,
            payload=PayoutReceiptCreate(
                lender_id=lender_id,
                received_amount=Decimal("12000.00"),
                payment_date=date(2026, 9, 1),
                case_id=case_id,
            ),
        )

    assert "BR-07" in str(exc.value)
    assert "non-disbursed status 'sanctioned'" in str(exc.value)


@pytest.mark.asyncio
async def test_br07_receipt_links_successfully_to_disbursed_case(mock_recon_db: MockReconDbSession) -> None:
    """BR-07: Linking succeeds when case is in 'disbursed' status."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    case_id = uuid.uuid4()

    lender = Lender(id=lender_id, org_id=org_id, name="ICICI Bank", is_active=True)
    mock_recon_db.lenders[lender_id] = lender

    disbursed_case = Case(
        id=case_id,
        org_id=org_id,
        case_no="CASE-2026-002",
        status="disbursed",
        owner_id=uuid.uuid4(),
    )
    mock_recon_db.cases[case_id] = disbursed_case

    service = PayoutReceiptService(session=mock_recon_db)  # type: ignore[arg-type]

    receipt = await service.create_receipt(
        org_id=org_id,
        payload=PayoutReceiptCreate(
            lender_id=lender_id,
            received_amount=Decimal("15000.00"),
            tds_amount=Decimal("750.00"),
            payment_date=date(2026, 9, 15),
            case_id=case_id,
            utr_reference="UTR998877",
        ),
    )

    assert receipt.id is not None
    assert receipt.case_id == case_id
    assert receipt.net_amount == Decimal("14250.00")
    assert receipt.match_status == "unmatched"


# =============================================================================
# 5. Statement Ingestion, Dry Run & Commit Tests
# =============================================================================
@pytest.mark.asyncio
async def test_statement_column_mapping_and_dry_run(mock_recon_db: MockReconDbSession) -> None:
    """Test column mapping persistence and dry run preview."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()

    lender = Lender(id=lender_id, org_id=org_id, name="HDFC Bank", is_active=True)
    mock_recon_db.lenders[lender_id] = lender

    # Setup disbursed case and expectation
    case = Case(id=case_id, org_id=org_id, case_no="CASE-HDFC-101", status="disbursed", owner_id=uuid.uuid4())
    party = Party(id=uuid.uuid4(), org_id=org_id, name="Rajesh Kumar", mobile_primary="9876543210")
    case_party = CaseParty(id=uuid.uuid4(), org_id=org_id, case_id=case_id, party_id=party.id, role="primary_applicant")
    case_party.party = party
    case.case_parties = [case_party]
    mock_recon_db.cases[case_id] = case

    app = LenderApplication(
        id=app_id,
        org_id=org_id,
        case_id=case_id,
        lender_id=lender_id,
        product="used_car",
        disbursal_ref="LAN-HDFC-999",
        status="disbursed",
    )
    mock_recon_db.applications[app_id] = app

    exp = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        disbursal_amount=Decimal("500000.00"),
        gross_amount=Decimal("10000.00"),
        tds_amount=Decimal("500.00"),
        net_amount=Decimal("9500.00"),
        status="due",
    )
    exp.case = case
    exp.lender_application = app
    mock_recon_db.expectations[exp.id] = exp

    import_service = ReconciliationImportService(session=mock_recon_db)  # type: ignore[arg-type]

    # Save mapping
    mapping = await import_service.save_column_mapping(
        org_id=org_id,
        payload=StatementColumnMappingCreate(
            lender_id=lender_id,
            mapping_name="HDFC Monthly",
            mappings={
                "loan_account_no": "Loan ID",
                "customer_name": "Borrower",
                "received_amount": "Gross Commission",
                "tds_amount": "TDS",
                "payment_date": "Date",
                "utr_reference": "Ref",
            },
        ),
    )
    assert mapping.id is not None

    csv_data = (
        "Loan ID,Borrower,Gross Commission,TDS,Date,Ref\n"
        "LAN-HDFC-999,Rajesh Kumar,10000.00,500.00,2026-09-10,UTR111\n"
        "UNKNOWN-LAN,Other Person,5000.00,250.00,2026-09-11,UTR222\n"
    )

    report = await import_service.dry_run_import(
        org_id=org_id,
        lender_id=lender_id,
        filename="hdfc_sept.csv",
        csv_content=csv_data,
        column_mapping=mapping.mappings,
    )

    assert report.total_rows == 2
    assert report.valid_rows == 2
    assert report.potential_matched == 1
    assert report.potential_unmatched == 1
    assert report.rows[0].match_status == "matched"
    assert report.rows[0].matched_case_no == "CASE-HDFC-101"
    assert report.rows[1].match_status == "unmatched"


@pytest.mark.asyncio
async def test_commit_import_and_auto_matching(mock_recon_db: MockReconDbSession) -> None:
    """Test commit mode creating receipts and reconciliations."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()

    lender = Lender(id=lender_id, org_id=org_id, name="Axis Bank", is_active=True)
    mock_recon_db.lenders[lender_id] = lender

    case = Case(id=case_id, org_id=org_id, case_no="CASE-AXIS-001", status="disbursed", owner_id=uuid.uuid4())
    mock_recon_db.cases[case_id] = case

    app = LenderApplication(
        id=app_id,
        org_id=org_id,
        case_id=case_id,
        lender_id=lender_id,
        product="new_car",
        disbursal_ref="AXIS-LN-555",
        status="disbursed",
    )
    mock_recon_db.applications[app_id] = app

    exp = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        disbursal_amount=Decimal("1000000.00"),
        gross_amount=Decimal("20000.00"),
        tds_amount=Decimal("1000.00"),
        net_amount=Decimal("19000.00"),
        status="due",
    )
    exp.case = case
    exp.lender_application = app
    mock_recon_db.expectations[exp.id] = exp

    import_service = ReconciliationImportService(session=mock_recon_db)  # type: ignore[arg-type]

    csv_data = (
        "loan_account_no,customer_name,received_amount,tds_amount,payment_date,utr_reference\n"
        "AXIS-LN-555,Anand Verma,20000.00,1000.00,2026-09-20,UTR333\n"
    )

    batch = await import_service.commit_import(
        org_id=org_id,
        lender_id=lender_id,
        filename="axis_payout.csv",
        csv_content=csv_data,
        column_mapping={
            "loan_account_no": "loan_account_no",
            "customer_name": "customer_name",
            "received_amount": "received_amount",
            "tds_amount": "tds_amount",
            "payment_date": "payment_date",
            "utr_reference": "utr_reference",
        },
    )

    assert batch.total_rows == 1
    assert batch.matched_rows == 1
    assert batch.unmatched_rows == 0
    assert exp.status == "paid"
    assert len(mock_recon_db.reconciliations) == 1


# =============================================================================
# 6. FR-PAY-008: 24-Hour Batch Reversal Window Tests
# =============================================================================
@pytest.mark.asyncio
async def test_reversal_within_24_hours_succeeds(mock_recon_db: MockReconDbSession) -> None:
    """Batch reversal within 24h successfully restores expectations and unlinks receipts."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    exp_id = uuid.uuid4()
    receipt_id = uuid.uuid4()

    exp = PayoutExpectation(
        id=exp_id,
        org_id=org_id,
        case_id=uuid.uuid4(),
        lender_application_id=uuid.uuid4(),
        disbursal_amount=Decimal("500000.00"),
        gross_amount=Decimal("10000.00"),
        tds_amount=Decimal("500.00"),
        net_amount=Decimal("9500.00"),
        status="paid",  # previously matched by this batch
    )
    mock_recon_db.expectations[exp_id] = exp

    batch = ImportBatch(
        id=batch_id,
        org_id=org_id,
        lender_id=lender_id,
        filename="batch_test.csv",
        total_rows=1,
        matched_rows=1,
        status="committed",
    )
    batch.created_at = datetime.now(UTC) - timedelta(hours=2)  # 2 hours old
    mock_recon_db.batches[batch_id] = batch

    receipt = PayoutReceipt(
        id=receipt_id,
        org_id=org_id,
        lender_id=lender_id,
        import_batch_id=batch_id,
        received_amount=Decimal("10000.00"),
        tds_amount=Decimal("500.00"),
        net_amount=Decimal("9500.00"),
        payment_date=date(2026, 9, 20),
        match_status="matched",
    )
    mock_recon_db.receipts[receipt_id] = receipt

    recon = Reconciliation(
        id=uuid.uuid4(),
        org_id=org_id,
        expectation_id=exp_id,
        receipt_id=receipt_id,
        expected_amount=Decimal("10000.00"),
        received_amount=Decimal("10000.00"),
        variance_amount=Decimal("0.00"),
        status="matched",
        tolerance_used=Decimal("10.00"),
        is_manual=False,
        reconciled_at=datetime.now(UTC),
    )
    receipt.reconciliation = recon
    mock_recon_db.reconciliations[recon.id] = recon

    import_service = ReconciliationImportService(session=mock_recon_db)  # type: ignore[arg-type]

    reversed_batch = await import_service.reverse_import_batch(
        org_id=org_id,
        batch_id=batch_id,
        reversal_reason="Wrong file uploaded by accountant",
    )

    assert reversed_batch.status == "reversed"
    assert reversed_batch.reversal_reason == "Wrong file uploaded by accountant"
    assert exp.status == "due"  # Restored from paid to due!
    assert receipt_id not in mock_recon_db.receipts
    assert recon.id not in mock_recon_db.reconciliations


@pytest.mark.asyncio
async def test_reversal_past_24_hours_fails(mock_recon_db: MockReconDbSession) -> None:
    """FR-PAY-008: Batch reversal beyond 24h is strictly rejected."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    batch_id = uuid.uuid4()

    batch = ImportBatch(
        id=batch_id,
        org_id=org_id,
        lender_id=lender_id,
        filename="old_batch.csv",
        total_rows=5,
        status="committed",
    )
    batch.created_at = datetime.now(UTC) - timedelta(hours=25)  # 25 hours old (> 24h limit)
    mock_recon_db.batches[batch_id] = batch

    import_service = ReconciliationImportService(session=mock_recon_db)  # type: ignore[arg-type]

    with pytest.raises(BusinessRuleViolationError) as exc:
        await import_service.reverse_import_batch(
            org_id=org_id,
            batch_id=batch_id,
            reversal_reason="Belated correction",
        )

    assert "24 hours" in str(exc.value)


# =============================================================================
# 7. Manual Matching & Variance Classification Tests
# =============================================================================
@pytest.mark.asyncio
async def test_manual_matching_and_short_variance(mock_recon_db: MockReconDbSession) -> None:
    """Test manual match resulting in 'short' variance."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()
    exp_id = uuid.uuid4()
    receipt_id = uuid.uuid4()

    case = Case(id=case_id, org_id=org_id, case_no="CASE-MANUAL-01", status="disbursed", owner_id=uuid.uuid4())
    mock_recon_db.cases[case_id] = case

    app = LenderApplication(id=app_id, org_id=org_id, case_id=case_id, lender_id=lender_id, product="used_car", status="disbursed")
    mock_recon_db.applications[app_id] = app

    exp = PayoutExpectation(
        id=exp_id,
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        disbursal_amount=Decimal("500000.00"),
        gross_amount=Decimal("15000.00"),
        tds_amount=Decimal("750.00"),
        net_amount=Decimal("14250.00"),
        status="due",
    )
    exp.case = case
    exp.lender_application = app
    mock_recon_db.expectations[exp_id] = exp

    # Receipt received ₹14,000 (short by ₹1,000)
    receipt = PayoutReceipt(
        id=receipt_id,
        org_id=org_id,
        lender_id=lender_id,
        received_amount=Decimal("14000.00"),
        tds_amount=Decimal("700.00"),
        net_amount=Decimal("13300.00"),
        payment_date=date(2026, 9, 25),
        match_status="unmatched",
    )
    mock_recon_db.receipts[receipt_id] = receipt

    service = PayoutReceiptService(session=mock_recon_db)  # type: ignore[arg-type]

    recon = await service.manual_match(
        org_id=org_id,
        payload=ManualMatchRequest(
            expectation_id=exp_id,
            receipt_id=receipt_id,
            tolerance=Decimal("10.00"),
            notes="Short payment due to lender subvention deduction",
        ),
    )

    assert recon.status == "short"
    assert recon.variance_amount == Decimal("-1000.00")
    assert receipt.match_status == "matched"
    assert exp.status == "paid"


# =============================================================================
# 8. FR-PAY-011: Commission Clawbacks Tests
# =============================================================================
@pytest.mark.asyncio
async def test_clawback_event_creation_transitions_status(mock_recon_db: MockReconDbSession) -> None:
    """Clawback event updates expectation status to 'clawback'."""
    org_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()
    exp_id = uuid.uuid4()

    exp = PayoutExpectation(
        id=exp_id,
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        disbursal_amount=Decimal("800000.00"),
        gross_amount=Decimal("16000.00"),
        tds_amount=Decimal("800.00"),
        net_amount=Decimal("15200.00"),
        status="paid",
    )
    mock_recon_db.expectations[exp_id] = exp

    clawback_service = ClawbackService(session=mock_recon_db)  # type: ignore[arg-type]

    event = await clawback_service.create_clawback(
        org_id=org_id,
        payload=ClawbackEventCreate(
            case_id=case_id,
            lender_application_id=app_id,
            expectation_id=exp_id,
            clawback_amount=Decimal("16000.00"),
            reason="Customer foreclosed within 90 days of disbursal",
            effective_date=date(2026, 10, 1),
        ),
    )

    assert event.id is not None
    assert event.status == "pending"
    assert exp.status == "clawback"


@pytest.mark.asyncio
async def test_clawback_exceeding_gross_rejected(mock_recon_db: MockReconDbSession) -> None:
    """Clawback amount cannot exceed expectation gross amount."""
    org_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()
    exp_id = uuid.uuid4()

    exp = PayoutExpectation(
        id=exp_id,
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        disbursal_amount=Decimal("500000.00"),
        gross_amount=Decimal("10000.00"),
        tds_amount=Decimal("500.00"),
        net_amount=Decimal("9500.00"),
        status="paid",
    )
    mock_recon_db.expectations[exp_id] = exp

    clawback_service = ClawbackService(session=mock_recon_db)  # type: ignore[arg-type]

    with pytest.raises(BusinessRuleViolationError) as exc:
        await clawback_service.create_clawback(
            org_id=org_id,
            payload=ClawbackEventCreate(
                case_id=case_id,
                lender_application_id=app_id,
                expectation_id=exp_id,
                clawback_amount=Decimal("15000.00"),  # > 10000.00 gross
                reason="Excess clawback",
                effective_date=date(2026, 10, 1),
            ),
        )

    assert "cannot exceed expectation gross amount" in str(exc.value)


# =============================================================================
# 9. Outstanding Report with Ageing Breakdown Tests
# =============================================================================
@pytest.mark.asyncio
async def test_outstanding_report_with_ageing(mock_recon_db: MockReconDbSession) -> None:
    """Test aggregation of outstanding receivables by lender with ageing."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()

    lender = Lender(id=lender_id, org_id=org_id, name="SBI Auto Loans", is_active=True)
    mock_recon_db.lenders[lender_id] = lender

    # Case 1: due 10 days ago (0_30) -> ₹10,000
    app1_id = uuid.uuid4()
    app1 = LenderApplication(
        id=app1_id,
        org_id=org_id,
        case_id=uuid.uuid4(),
        lender_id=lender_id,
        product="new_car",
        disbursal_date=date.today() - timedelta(days=10),
    )
    mock_recon_db.applications[app1_id] = app1
    exp1 = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=app1.case_id,
        lender_application_id=app1_id,
        disbursal_amount=Decimal("500000.00"),
        gross_amount=Decimal("10000.00"),
        tds_amount=Decimal("500.00"),
        net_amount=Decimal("9500.00"),
        status="due",
    )
    exp1.lender_application = app1
    mock_recon_db.expectations[exp1.id] = exp1

    # Case 2: due 75 days ago (61_90) -> ₹25,000
    app2_id = uuid.uuid4()
    app2 = LenderApplication(
        id=app2_id,
        org_id=org_id,
        case_id=uuid.uuid4(),
        lender_id=lender_id,
        product="used_car",
        disbursal_date=date.today() - timedelta(days=75),
    )
    mock_recon_db.applications[app2_id] = app2
    exp2 = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=app2.case_id,
        lender_application_id=app2_id,
        disbursal_amount=Decimal("1000000.00"),
        gross_amount=Decimal("25000.00"),
        tds_amount=Decimal("1250.00"),
        net_amount=Decimal("23750.00"),
        status="due",
    )
    exp2.lender_application = app2
    mock_recon_db.expectations[exp2.id] = exp2

    service = PayoutReceiptService(session=mock_recon_db)  # type: ignore[arg-type]
    report = await service.get_outstanding_report(org_id=org_id)

    assert report.total_expected == Decimal("35000.00")
    assert report.total_received == Decimal("0.00")
    assert report.total_outstanding == Decimal("35000.00")
    assert len(report.lenders) == 1

    lender_summary = report.lenders[0]
    assert lender_summary.lender_name == "SBI Auto Loans"
    assert lender_summary.pending_cases_count == 2
    assert lender_summary.ageing_0_30 == Decimal("10000.00")
    assert lender_summary.ageing_61_90 == Decimal("25000.00")
    assert lender_summary.ageing_31_60 == Decimal("0.00")
    assert lender_summary.ageing_90_plus == Decimal("0.00")
