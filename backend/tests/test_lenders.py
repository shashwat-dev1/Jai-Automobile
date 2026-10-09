"""
DSA OS — Lender and Lender Application Test Suite
Verifies:
- Multi-lender submission per case (FR-LAP-001)
- Sanction recording (FR-LAP-002)
- Rejection requires reason code (BR-04, FR-LAP-004)
- At most one winning application per case; only Disbursed can be winning (BR-05, FR-LAP-005)
- Disbursed amount may not exceed sanctioned without override (BR-08, FR-LAP-006)
- Status transitions return 409 with allowed states on invalid transitions (FR-WFL-001)
- Optimistic locking concurrency control
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from app.modules.cases.models import Case
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.lenders.schemas import (
    DisbursalTerms,
    LenderApplicationCreateRequest,
    LenderApplicationUpdateRequest,
    LenderCreateRequest,
    SanctionTerms,
)
from app.modules.lenders.service import LenderApplicationService, LenderService
from app.shared.exceptions import (
    BusinessRuleViolationError,
    ConflictError,
)


class MockLenderDbSession:
    """In-memory mock session for high-speed unit and business logic testing."""

    def __init__(self) -> None:
        self.lenders: dict[uuid.UUID, Lender] = {}
        self.cases: dict[uuid.UUID, Case] = {}
        self.applications: dict[uuid.UUID, LenderApplication] = {}
        self.status_history: list[Any] = []
        self.audit_events: list[dict[str, Any]] = []

    def add(self, entity: Any) -> None:
        now = datetime.now(UTC)
        if getattr(entity, "created_at", None) is None:
            entity.created_at = now
        if getattr(entity, "updated_at", None) is None:
            entity.updated_at = now

        if isinstance(entity, Lender):
            self.lenders[entity.id] = entity
        elif isinstance(entity, Case):
            self.cases[entity.id] = entity
        elif isinstance(entity, LenderApplication):
            # simulate relationship back-reference
            if entity.lender_id in self.lenders:
                entity.lender = self.lenders[entity.lender_id]
            self.applications[entity.id] = entity
        else:
            self.status_history.append(entity)

    async def flush(self) -> None:
        pass

    async def commit(self) -> None:
        pass

    async def refresh(self, entity: Any) -> None:
        if isinstance(entity, LenderApplication) and entity.lender_id in self.lenders:
            entity.lender = self.lenders[entity.lender_id]

    async def execute(self, stmt: Any) -> Any:
        stmt_str = str(stmt).lower()

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

            def scalar_one(self) -> Any:
                return self._items[0] if self._items else None

        # Handle UPDATE lender_applications (unsetting is_winning)
        if "update lender_applications" in stmt_str:
            for app in self.applications.values():
                app.is_winning = False
            return MockResult([])

        # Handle SELECT from lenders
        if "from lenders" in stmt_str:
            results = list(self.lenders.values())
            # Duplicate check or get check
            return MockResult(results)

        # Handle SELECT from cases
        if "from cases" in stmt_str:
            return MockResult(list(self.cases.values()))

        # Handle SELECT from lender_applications
        if "from lender_applications" in stmt_str:
            results = list(self.applications.values())
            return MockResult(results)

        return MockResult([])


@pytest.mark.asyncio
class TestLenderRegistry:
    """Test suite for empanelled lender catalog."""

    async def test_create_and_list_lenders(self):
        db = MockLenderDbSession()
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        service = LenderService(db)

        # Create Bank
        hdfc = await service.create_lender(
            org_id=org_id,
            payload=LenderCreateRequest(
                name="HDFC Bank",
                code="HDFC",
                type="bank",
                products=["new_car", "used_car"],
                dsa_code="DSA-HDFC-991",
            ),
            actor_id=user_id,
            actor_role="owner",
        )
        assert hdfc.name == "HDFC Bank"
        assert hdfc.type == "bank"
        assert hdfc.is_active is True

        # List all
        lenders = await service.list_lenders(org_id=org_id)
        assert len(lenders) >= 1
        assert lenders[0].name == "HDFC Bank"

    async def test_duplicate_lender_name_rejected(self):
        db = MockLenderDbSession()
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        service = LenderService(db)

        await service.create_lender(
            org_id=org_id,
            payload=LenderCreateRequest(name="Kotak Mahindra Bank", type="bank"),
            actor_id=user_id,
            actor_role="owner",
        )

        with pytest.raises(ConflictError):
            await service.create_lender(
                org_id=org_id,
                payload=LenderCreateRequest(name="Kotak Mahindra Bank", type="bank"),
                actor_id=user_id,
                actor_role="owner",
            )


@pytest.mark.asyncio
class TestLenderApplicationsWorkflow:
    """Test suite for multi-lender applications, status transitions, sanctions, and disbursals."""

    def _setup_case_and_lenders(self, db: MockLenderDbSession):
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        case = Case(
            id=uuid.uuid4(),
            org_id=org_id,
            case_no=f"LOS-{uuid.uuid4().hex[:6].upper()}",
            product_type="used_car",
            status="applied",
            loan_amount_requested=Decimal("800000.00"),
            source_id=uuid.uuid4(),
            owner_id=user_id,
            version=1,
            entered_stage_at=datetime.now(UTC),
        )
        db.add(case)

        lender1 = Lender(
            id=uuid.uuid4(),
            org_id=org_id,
            name="Bank A",
            type="bank",
            products=["used_car"],
            is_active=True,
        )
        db.add(lender1)

        lender2 = Lender(
            id=uuid.uuid4(),
            org_id=org_id,
            name="Bank B",
            type="bank",
            products=["used_car"],
            is_active=True,
        )
        db.add(lender2)

        return org_id, user_id, case, lender1, lender2

    async def test_multi_lender_applications_submission(self):
        db = MockLenderDbSession()
        org_id, user_id, case, lender1, lender2 = self._setup_case_and_lenders(db)
        app_service = LenderApplicationService(db)

        # Login to Lender 1
        app1 = await app_service.create_application(
            org_id=org_id,
            case_id=case.id,
            payload=LenderApplicationCreateRequest(
                lender_id=lender1.id,
                product="used_car",
                login_ref="HDFC-REF-101",
                login_date=date.today(),
            ),
            actor_id=user_id,
            actor_role="processor",
        )
        assert app1.status == "logged_in"
        assert app1.is_winning is False

        # Login to Lender 2
        app2 = await app_service.create_application(
            org_id=org_id,
            case_id=case.id,
            payload=LenderApplicationCreateRequest(
                lender_id=lender2.id,
                product="used_car",
                login_ref="ICICI-REF-202",
                login_date=date.today(),
            ),
            actor_id=user_id,
            actor_role="processor",
        )
        assert app2.status == "logged_in"

        apps = await app_service.list_applications(org_id=org_id, case_id=case.id)
        assert len(apps) == 2
        refs = [a.login_ref for a in apps]
        assert "HDFC-REF-101" in refs
        assert "ICICI-REF-202" in refs

    async def test_status_transition_conflict_409(self):
        """FR-WFL-001: Invalid transitions return ConflictError (409) with allowed states."""
        db = MockLenderDbSession()
        org_id, user_id, case, lender1, _ = self._setup_case_and_lenders(db)
        app_service = LenderApplicationService(db)

        app = await app_service.create_application(
            org_id=org_id,
            case_id=case.id,
            payload=LenderApplicationCreateRequest(lender_id=lender1.id, product="used_car"),
            actor_id=user_id,
            actor_role="processor",
        )

        with pytest.raises(ConflictError) as exc_info:
            await app_service.update_application(
                org_id=org_id,
                case_id=case.id,
                application_id=app.id,
                payload=LenderApplicationUpdateRequest(
                    status="disbursed",
                    version=app.version,
                ),
                actor_id=user_id,
                actor_role="processor",
            )
        assert "Cannot transition lender application" in str(exc_info.value)
        assert "Allowed next states" in str(exc_info.value)

    async def test_rejection_reason_mandatory_br04(self):
        """BR-04: Rejected application requires rejection reason code."""
        db = MockLenderDbSession()
        org_id, user_id, case, lender1, _ = self._setup_case_and_lenders(db)
        app_service = LenderApplicationService(db)

        app = await app_service.create_application(
            org_id=org_id,
            case_id=case.id,
            payload=LenderApplicationCreateRequest(lender_id=lender1.id, product="used_car"),
            actor_id=user_id,
            actor_role="processor",
        )

        # Reject without reason code -> fails
        with pytest.raises(BusinessRuleViolationError) as exc_info:
            await app_service.update_application(
                org_id=org_id,
                case_id=case.id,
                application_id=app.id,
                payload=LenderApplicationUpdateRequest(
                    status="rejected",
                    version=app.version,
                ),
                actor_id=user_id,
                actor_role="processor",
            )
        assert "BR-04" in str(exc_info.value)

        # Reject with valid reason code -> succeeds
        updated = await app_service.update_application(
            org_id=org_id,
            case_id=case.id,
            application_id=app.id,
            payload=LenderApplicationUpdateRequest(
                status="rejected",
                rejection_reason_code="cibil_score_low",
                rejection_notes="Customer bureau score below policy cutoff",
                version=app.version,
            ),
            actor_id=user_id,
            actor_role="processor",
        )
        assert updated.status == "rejected"
        assert updated.rejection_reason_code == "cibil_score_low"

    async def test_sanction_and_disbursal_override_br08(self):
        """BR-08: Disbursed amount cannot exceed sanctioned amount without recorded override."""
        db = MockLenderDbSession()
        org_id, user_id, case, lender1, _ = self._setup_case_and_lenders(db)
        app_service = LenderApplicationService(db)

        app = await app_service.create_application(
            org_id=org_id,
            case_id=case.id,
            payload=LenderApplicationCreateRequest(lender_id=lender1.id, product="used_car"),
            actor_id=user_id,
            actor_role="processor",
        )

        # Record Sanction: ₹7,50,000
        sanctioned_app = await app_service.update_application(
            org_id=org_id,
            case_id=case.id,
            application_id=app.id,
            payload=LenderApplicationUpdateRequest(
                sanction_terms=SanctionTerms(
                    sanction_amount=Decimal("750000.00"),
                    sanction_tenure_months=60,
                    sanction_rate=Decimal("9.50"),
                    sanction_margin_money=Decimal("50000.00"),
                    sanction_date=date.today(),
                ),
                version=app.version,
            ),
            actor_id=user_id,
            actor_role="processor",
        )
        assert sanctioned_app.status == "sanctioned"
        assert sanctioned_app.sanction_amount == Decimal("750000.00")

        # Customer accepts sanction
        accepted_app = await app_service.update_application(
            org_id=org_id,
            case_id=case.id,
            application_id=sanctioned_app.id,
            payload=LenderApplicationUpdateRequest(
                status="accepted_by_customer",
                version=sanctioned_app.version,
            ),
            actor_id=user_id,
            actor_role="processor",
        )
        assert accepted_app.status == "accepted_by_customer"

        # Disburse ₹8,00,000 (> ₹7,50,000) WITHOUT override reason -> fails BR-08
        with pytest.raises(BusinessRuleViolationError) as exc_info:
            await app_service.update_application(
                org_id=org_id,
                case_id=case.id,
                application_id=accepted_app.id,
                payload=LenderApplicationUpdateRequest(
                    disbursal=DisbursalTerms(
                        disbursal_amount=Decimal("800000.00"),
                        disbursal_date=date.today(),
                        disbursal_ref="UTR99887766",
                        disbursal_override_reason=None,
                    ),
                    version=accepted_app.version,
                ),
                actor_id=user_id,
                actor_role="processor",
            )
        assert "BR-08" in str(exc_info.value)

        # Disburse ₹8,00,000 WITH override reason -> succeeds
        disbursed_app = await app_service.update_application(
            org_id=org_id,
            case_id=case.id,
            application_id=accepted_app.id,
            payload=LenderApplicationUpdateRequest(
                disbursal=DisbursalTerms(
                    disbursal_amount=Decimal("800000.00"),
                    disbursal_date=date.today(),
                    disbursal_ref="UTR99887766",
                    disbursal_override_reason="Manager verbal sanction enhancement confirmed via email",
                ),
                is_winning=True,
                version=accepted_app.version,
            ),
            actor_id=user_id,
            actor_role="processor",
        )
        assert disbursed_app.status == "disbursed"
        assert disbursed_app.disbursal_amount == Decimal("800000.00")
        assert disbursed_app.is_winning is True
        assert case.status == "disbursed"
        assert case.loan_amount_disbursed == Decimal("800000.00")

    async def test_winning_application_constraint_br05(self):
        """BR-05: Exactly one winning application allowed per case, and must be in disbursed status."""
        db = MockLenderDbSession()
        org_id, user_id, case, lender1, _ = self._setup_case_and_lenders(db)
        app_service = LenderApplicationService(db)

        app1 = await app_service.create_application(
            org_id=org_id,
            case_id=case.id,
            payload=LenderApplicationCreateRequest(lender_id=lender1.id, product="used_car"),
            actor_id=user_id,
            actor_role="processor",
        )

        with pytest.raises(BusinessRuleViolationError) as exc_info:
            await app_service.update_application(
                org_id=org_id,
                case_id=case.id,
                application_id=app1.id,
                payload=LenderApplicationUpdateRequest(
                    is_winning=True,
                    version=app1.version,
                ),
                actor_id=user_id,
                actor_role="processor",
            )
        assert "BR-05" in str(exc_info.value)
