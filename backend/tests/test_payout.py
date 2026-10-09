"""
DSA OS — Payout Engine Test Suite
Verifies:
- Deterministic calculation engine: percent, flat, slab, boundary tickets, zero floating-point arithmetic
- BR-09: Sub-DSA / executive split invariants (<= 100% total percent, <= gross total split amount)
- BR-13: Frozen rule terms snapshotting
- FR-PAY-001: Payout rule effective date ranges and CRUD
- FR-PAY-002: Automatic expectation generation upon disbursal
- FR-PAY-003: "No Rule is Not Zero" invariant with Attention List flagging
- BR-10: PDD-gated payout release upon all PDD items reaching acknowledged_by_lender
- FR-PAY-005: Manual expectation overrides with mandatory justification and optimistic locking
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from app.modules.auth.models import User
from app.modules.cases.models import Case
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.payout.engine import (
    calculate_gross,
    calculate_net,
    calculate_tds,
    validate_and_compute_splits,
)
from app.modules.payout.models import PayoutExpectation, PayoutRule, PayoutSplit
from app.modules.payout.schemas import (
    PayoutExpectationOverrideRequest,
    PayoutRuleCreateRequest,
    PayoutSplitItem,
)
from app.modules.payout.service import PayoutService
from app.modules.pdd.models import PDDItem
from app.modules.sources.models import Source
from app.shared.exceptions import (
    BusinessRuleViolationError,
    ConflictError,
)


# =============================================================================
# 1. Deterministic Engine Unit Tests
# =============================================================================
def test_payout_engine_percent_basis() -> None:
    """disbursal ₹10,00,000 @ 1.5% commission, 5% TDS."""
    disbursal = Decimal("1000000.00")
    gross = calculate_gross(disbursal_amount=disbursal, basis="percent", rate_percent=Decimal("1.500"))
    assert gross == Decimal("15000.00")

    tds = calculate_tds(gross_amount=gross, tds_rate_percent=Decimal("5.00"))
    assert tds == Decimal("750.00")

    net = calculate_net(gross_amount=gross, tds_amount=tds)
    assert net == Decimal("14250.00")


def test_payout_engine_flat_basis() -> None:
    """Flat ₹5,000 commission, 5% TDS."""
    disbursal = Decimal("350000.00")
    gross = calculate_gross(disbursal_amount=disbursal, basis="flat", flat_amount=Decimal("5000.00"))
    assert gross == Decimal("5000.00")

    tds = calculate_tds(gross_amount=gross, tds_rate_percent=Decimal("5.00"))
    assert tds == Decimal("250.00")

    net = calculate_net(gross_amount=gross, tds_amount=tds)
    assert net == Decimal("4750.00")


def test_payout_engine_slab_basis_and_boundaries() -> None:
    """Tiered slab brackets with boundary ticket sizes."""
    slabs = [
        {"min_amount": 0, "max_amount": 500000, "rate_percent": 1.25},
        {"min_amount": 500001, "max_amount": 1500000, "rate_percent": 1.50},
        {"min_amount": 1500001, "max_amount": None, "rate_percent": 2.00},
    ]

    # Under bracket 1
    g1 = calculate_gross(Decimal("400000.00"), basis="slab", slabs=slabs)
    assert g1 == Decimal("5000.00")  # 400000 * 1.25%

    # Exact boundary of bracket 1
    g_edge1 = calculate_gross(Decimal("500000.00"), basis="slab", slabs=slabs)
    assert g_edge1 == Decimal("6250.00")  # 500000 * 1.25%

    # Under bracket 2
    g2 = calculate_gross(Decimal("1000000.00"), basis="slab", slabs=slabs)
    assert g2 == Decimal("15000.00")  # 1000000 * 1.50%

    # Upper bracket with no max
    g3 = calculate_gross(Decimal("2500000.00"), basis="slab", slabs=slabs)
    assert g3 == Decimal("50000.00")  # 2500000 * 2.00%


def test_payout_engine_splits_validation() -> None:
    """BR-09: Splits must not exceed 100% total percent or gross amount."""
    gross = Decimal("20000.00")

    # Valid splits: 50% dealer, 20% executive, 10% processor = 80% <= 100%
    valid_splits = [
        PayoutSplitItem(beneficiary_type="source", share_type="percent", share_value=Decimal("50.000")),
        PayoutSplitItem(beneficiary_type="sales_agent", share_type="percent", share_value=Decimal("20.000")),
        PayoutSplitItem(beneficiary_type="processor", share_type="percent", share_value=Decimal("10.000")),
    ]
    computed = validate_and_compute_splits(gross, valid_splits)
    assert len(computed) == 3
    assert computed[0][1] == Decimal("10000.00")
    assert computed[1][1] == Decimal("4000.00")
    assert computed[2][1] == Decimal("2000.00")

    # Invalid: Total percent = 105% > 100%
    invalid_pct = [
        PayoutSplitItem(beneficiary_type="source", share_type="percent", share_value=Decimal("70.000")),
        PayoutSplitItem(beneficiary_type="sales_agent", share_type="percent", share_value=Decimal("35.000")),
    ]
    with pytest.raises(BusinessRuleViolationError) as exc_pct:
        validate_and_compute_splits(gross, invalid_pct)
    assert "exceed 100" in str(exc_pct.value)

    # Invalid: Total flat split amount > gross
    invalid_flat = [
        PayoutSplitItem(beneficiary_type="source", share_type="flat", share_value=Decimal("15000.00")),
        PayoutSplitItem(beneficiary_type="sales_agent", share_type="flat", share_value=Decimal("8000.00")),
    ]
    with pytest.raises(BusinessRuleViolationError) as exc_flat:
        validate_and_compute_splits(gross, invalid_flat)
    assert "exceed gross amount" in str(exc_flat.value)


class MockResult:
    def __init__(self, items: list[Any]) -> None:
        self._items = items

    def scalars(self) -> Any:
        class S:
            def __init__(self, it: list[Any]) -> None:
                self._it = it

            def all(self) -> list[Any]:
                return self._it

            def first(self) -> Any:
                return self._it[0] if self._it else None

        return S(self._items)

    def scalar_one_or_none(self) -> Any:
        return self._items[0] if self._items else None

    def scalar(self) -> Any:
        return self._items[0] if self._items else None

    def all(self) -> list[Any]:
        return self._items


class MockPayoutDbSession:
    """In-memory mock session for Payout testing."""

    def __init__(self) -> None:
        self.rules: dict[uuid.UUID, PayoutRule] = {}
        self.expectations: dict[uuid.UUID, PayoutExpectation] = {}
        self.splits: dict[uuid.UUID, PayoutSplit] = {}
        self.cases: dict[uuid.UUID, Case] = {}
        self.applications: dict[uuid.UUID, LenderApplication] = {}
        self.lenders: dict[uuid.UUID, Lender] = {}
        self.sources: dict[uuid.UUID, Source] = {}
        self.users: dict[uuid.UUID, User] = {}
        self.pdd_items: dict[uuid.UUID, PDDItem] = {}
        self.audit_events: list[dict[str, Any]] = []

    def add(self, entity: Any) -> None:
        now = datetime.now(UTC)
        if getattr(entity, "created_at", None) is None:
            entity.created_at = now
        if getattr(entity, "updated_at", None) is None:
            entity.updated_at = now

        if isinstance(entity, PayoutRule):
            if entity.lender_id in self.lenders:
                entity.lender = self.lenders[entity.lender_id]
            self.rules[entity.id] = entity
        elif isinstance(entity, PayoutExpectation):
            if entity.case_id in self.cases:
                entity.case = self.cases[entity.case_id]
            if entity.lender_application_id in self.applications:
                entity.lender_application = self.applications[entity.lender_application_id]
            if entity.rule_id and entity.rule_id in self.rules:
                entity.rule = self.rules[entity.rule_id]
            entity.splits = [s for s in self.splits.values() if s.expectation_id == entity.id]
            self.expectations[entity.id] = entity
        elif isinstance(entity, PayoutSplit):
            if entity.source_id and entity.source_id in self.sources:
                entity.source = self.sources[entity.source_id]
            if entity.user_id and entity.user_id in self.users:
                entity.user = self.users[entity.user_id]
            self.splits[entity.id] = entity
            if entity.expectation_id in self.expectations:
                if entity not in self.expectations[entity.expectation_id].splits:
                    self.expectations[entity.expectation_id].splits.append(entity)

    async def commit(self) -> None:
        pass

    async def refresh(self, entity: Any) -> None:
        pass

    async def execute(self, statement: Any) -> Any:
        stmt_str = str(statement).lower()

        # Handle DELETE payout_splits
        if "delete from payout_splits" in stmt_str:
            expectation_id = None
            for param in statement._where_criteria:
                param_str = str(param)
                if "expectation_id" in param_str:
                    expectation_id = getattr(param.right, "value", None)
            if expectation_id:
                to_del = [sid for sid, s in self.splits.items() if s.expectation_id == expectation_id]
                for sid in to_del:
                    del self.splits[sid]
                if expectation_id in self.expectations:
                    self.expectations[expectation_id].splits = []
            return None

        # COUNT queries
        if "count" in stmt_str and "pdd_items" in stmt_str:
            items = list(self.pdd_items.values())
            if "status !=" in stmt_str:
                unack = [i for i in items if i.status != "acknowledged_by_lender"]
                return MockResult([len(unack)])
            return MockResult([len(items)])

        # Query payout_rules
        if "from payout_rules" in stmt_str:
            target_product = None
            for crit in getattr(statement, "_where_criteria", []):
                crit_str = str(crit).lower()
                if "payout_rules.product" in crit_str:
                    target_product = getattr(crit.right, "value", None)

            filtered_rules = []
            for r in self.rules.values():
                if target_product is not None and r.product != target_product:
                    continue
                filtered_rules.append(r)
            return MockResult(filtered_rules)

        # Query payout_expectations
        if "from payout_expectations" in stmt_str:
            target_exp_id = None
            target_app_id = None
            filter_status_in = False

            for crit in getattr(statement, "_where_criteria", []):
                crit_str = str(crit).lower()
                if "payout_expectations.id" in crit_str and "lender_application_id" not in crit_str:
                    target_exp_id = getattr(crit.right, "value", None)
                elif "lender_application_id" in crit_str:
                    target_app_id = getattr(crit.right, "value", None)
                elif "status" in crit_str and "in" in crit_str:
                    filter_status_in = True

            if target_exp_id:
                exp = self.expectations.get(target_exp_id)
                return MockResult([exp] if exp else [])
            if target_app_id:
                found = [e for e in self.expectations.values() if e.lender_application_id == target_app_id]
                return MockResult(found)
            if filter_status_in:
                att = [e for e in self.expectations.values() if e.status in ("no_rule", "held")]
                return MockResult(att)

            return MockResult(list(self.expectations.values()))

        # Query payout_splits
        if "from payout_splits" in stmt_str:
            return MockResult(list(self.splits.values()))

        # Query lenders
        if "from lenders" in stmt_str:
            return MockResult(list(self.lenders.values()))

        # Query cases
        if "from cases" in stmt_str:
            return MockResult(list(self.cases.values()))

        # Query lender_applications
        if "from lender_applications" in stmt_str:
            return MockResult(list(self.applications.values()))

        return MockResult([])


# =============================================================================
# 3. Payout Service Integration Tests
# =============================================================================
@pytest.fixture
def mock_session() -> MockPayoutDbSession:
    session = MockPayoutDbSession()
    return session


@pytest.mark.asyncio
async def test_create_payout_rule_and_effective_dates(mock_session: MockPayoutDbSession) -> None:
    """Test commission grid rule creation and date validation."""
    org_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    lender = Lender(
        id=lender_id,
        org_id=org_id,
        name="HDFC Bank",
        is_active=True,
    )
    mock_session.lenders[lender_id] = lender

    service = PayoutService(session=mock_session)  # type: ignore[arg-type]

    # Invalid dates: effective_to < effective_from
    with pytest.raises(BusinessRuleViolationError) as exc_date:
        await service.create_rule(
            org_id=org_id,
            payload=PayoutRuleCreateRequest(
                lender_id=lender_id,
                product="used_car",
                effective_from=date(2026, 6, 1),
                effective_to=date(2026, 1, 1),
                basis="percent",
                rate_percent=Decimal("1.750"),
            ),
            actor_id=actor_id,
            actor_role="manager",
        )
    assert "effective_to" in str(exc_date.value)

    # Valid rule creation
    rule_res = await service.create_rule(
        org_id=org_id,
        payload=PayoutRuleCreateRequest(
            lender_id=lender_id,
            product="used_car",
            effective_from=date(2026, 1, 1),
            effective_to=date(2026, 12, 31),
            basis="percent",
            rate_percent=Decimal("1.750"),
            gating_type="pdd_complete",
            tds_rate_percent=Decimal("5.00"),
        ),
        actor_id=actor_id,
        actor_role="manager",
    )
    assert rule_res.lender_name == "HDFC Bank"
    assert rule_res.rate_percent == Decimal("1.750")
    assert rule_res.basis == "percent"
    assert rule_res.version == 1


@pytest.mark.asyncio
async def test_auto_expectation_calculation_on_disbursal(mock_session: MockPayoutDbSession) -> None:
    """Disbursal triggers expectation with gross, TDS, net and frozen rule snapshot (BR-13)."""
    org_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    lender = Lender(id=lender_id, org_id=org_id, name="ICICI Bank", is_active=True)
    mock_session.lenders[lender_id] = lender

    case = Case(
        id=case_id,
        org_id=org_id,
        case_no="DSA-2026-101",
        product_type="new_car",
        status="disbursed",
        owner_id=actor_id,
        loan_amount_requested=Decimal("800000.00"),
        source_id=uuid.uuid4(),
        version=1,
    )
    mock_session.cases[case_id] = case

    app = LenderApplication(
        id=app_id,
        org_id=org_id,
        case_id=case_id,
        lender_id=lender_id,
        product="new_car",
        status="disbursed",
        disbursal_amount=Decimal("800000.00"),
        disbursal_date=date(2026, 7, 15),
        lender=lender,
    )
    mock_session.applications[app_id] = app

    rule = PayoutRule(
        id=uuid.uuid4(),
        org_id=org_id,
        lender_id=lender_id,
        product="new_car",
        effective_from=date(2026, 1, 1),
        effective_to=date(2026, 12, 31),
        basis="percent",
        rate_percent=Decimal("2.000"),
        gating_type="pdd_complete",
        tds_rate_percent=Decimal("5.00"),
        is_active=True,
        version=1,
    )
    mock_session.rules[rule.id] = rule

    # Add incomplete PDD item
    pdd = PDDItem(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        document_type="rc_copy",
        title="RC Hypothecation Endorsement",
        status="pending",
        due_date=date(2026, 8, 30),
    )
    mock_session.pdd_items[pdd.id] = pdd

    service = PayoutService(session=mock_session)  # type: ignore[arg-type]
    exp = await service.calculate_expectation_on_disbursal(
        org_id=org_id,
        case_id=case_id,
        application_id=app_id,
        actor_id=actor_id,
        actor_role="manager",
    )
    assert exp is not None
    # 8,00,000 * 2% = 16,000.00 gross; 5% TDS = 800.00; net = 15,200.00
    assert exp.gross_amount == Decimal("16000.00")
    assert exp.tds_amount == Decimal("800.00")
    assert exp.net_amount == Decimal("15200.00")
    # PDD pending -> status held (BR-10)
    assert exp.status == "held"
    assert exp.gating_status == "pending"
    # Frozen snapshot check (BR-13)
    assert exp.rule_snapshot is not None
    assert exp.rule_snapshot["rate_percent"] == "2.000"


@pytest.mark.asyncio
async def test_no_rule_is_not_zero_invariant(mock_session: MockPayoutDbSession) -> None:
    """FR-PAY-003: Disbursal with no configured rule results in status='no_rule' and Attention item."""
    org_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()
    lender_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    lender = Lender(id=lender_id, org_id=org_id, name="Kotak Mahindra Prime", is_active=True)
    mock_session.lenders[lender_id] = lender

    case = Case(
        id=case_id,
        org_id=org_id,
        case_no="DSA-2026-999",
        product_type="commercial_vehicle",
        status="disbursed",
        owner_id=actor_id,
        loan_amount_requested=Decimal("1500000.00"),
        source_id=uuid.uuid4(),
        version=1,
    )
    mock_session.cases[case_id] = case

    app = LenderApplication(
        id=app_id,
        org_id=org_id,
        case_id=case_id,
        lender_id=lender_id,
        product="commercial_vehicle",  # No rule exists for this!
        status="disbursed",
        disbursal_amount=Decimal("1500000.00"),
        disbursal_date=date(2026, 7, 20),
        lender=lender,
    )
    mock_session.applications[app_id] = app

    service = PayoutService(session=mock_session)  # type: ignore[arg-type]
    exp = await service.calculate_expectation_on_disbursal(
        org_id=org_id,
        case_id=case_id,
        application_id=app_id,
        actor_id=actor_id,
        actor_role="manager",
    )
    assert exp is not None
    assert exp.status == "no_rule"
    assert exp.gross_amount == Decimal("0.00")
    assert exp.net_amount == Decimal("0.00")

    # Verify presence in attention list
    attention_items = await service.get_attention_list(org_id=org_id)
    assert len(attention_items) >= 1
    assert any(item.reason == "no_rule" for item in attention_items)


@pytest.mark.asyncio
async def test_pdd_gating_release_lifecycle(mock_session: MockPayoutDbSession) -> None:
    """BR-10: PDD items completion releases held payout to due."""
    org_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    now = datetime.now(UTC)

    exp = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        disbursal_amount=Decimal("500000.00"),
        gross_amount=Decimal("10000.00"),
        tds_rate_percent=Decimal("5.00"),
        tds_amount=Decimal("500.00"),
        net_amount=Decimal("9500.00"),
        status="held",
        gating_status="pending",
        version=1,
        created_at=now,
        updated_at=now,
    )
    mock_session.expectations[exp.id] = exp

    # PDD item marked acknowledged
    pdd = PDDItem(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        document_type="rc_copy",
        title="RC Hypothecation Endorsement",
        status="acknowledged_by_lender",
        due_date=date(2026, 8, 30),
    )
    mock_session.pdd_items[pdd.id] = pdd

    service = PayoutService(session=mock_session)  # type: ignore[arg-type]
    await service.check_and_release_pdd_gate(
        org_id=org_id,
        application_id=app_id,
        actor_id=actor_id,
        actor_role="manager",
    )

    assert exp.status == "due"
    assert exp.gating_status == "satisfied"
    assert exp.version == 2


@pytest.mark.asyncio
async def test_manual_override_with_optimistic_locking(mock_session: MockPayoutDbSession) -> None:
    """FR-PAY-005: Manual override preserves original gross amount and checks optimistic lock."""
    org_id = uuid.uuid4()
    case_id = uuid.uuid4()
    app_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    now = datetime.now(UTC)

    exp = PayoutExpectation(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        lender_application_id=app_id,
        disbursal_amount=Decimal("600000.00"),
        gross_amount=Decimal("9000.00"),
        tds_rate_percent=Decimal("5.00"),
        tds_amount=Decimal("450.00"),
        net_amount=Decimal("8550.00"),
        status="due",
        gating_status="satisfied",
        version=1,
        created_at=now,
        updated_at=now,
    )
    mock_session.expectations[exp.id] = exp

    service = PayoutService(session=mock_session)  # type: ignore[arg-type]

    # Stale version conflict
    with pytest.raises(ConflictError):
        await service.override_expectation(
            org_id=org_id,
            expectation_id=exp.id,
            payload=PayoutExpectationOverrideRequest(
                gross_amount=Decimal("12000.00"),
                override_reason="Agreed special festival incentive with branch manager",
                version=99,
            ),
            actor_id=actor_id,
            actor_role="manager",
        )

    # Valid override
    updated = await service.override_expectation(
        org_id=org_id,
        expectation_id=exp.id,
        payload=PayoutExpectationOverrideRequest(
            gross_amount=Decimal("12000.00"),
            override_reason="Agreed special festival incentive with branch manager",
            version=1,
        ),
        actor_id=actor_id,
        actor_role="manager",
    )

    assert updated.is_override is True
    assert updated.original_gross_amount == Decimal("9000.00")
    assert updated.gross_amount == Decimal("12000.00")
    # TDS recomputed @ 5% on 12,000 = 600.00
    assert updated.tds_amount == Decimal("600.00")
    assert updated.net_amount == Decimal("11400.00")
    assert updated.version == 2
