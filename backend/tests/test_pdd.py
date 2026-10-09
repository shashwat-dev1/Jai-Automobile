"""
DSA OS — Post-Disbursal Documents (PDD) Test Suite
Verifies:
- Auto-creation of standard PDD deliverables upon disbursal (FR-WFL-008)
- Idempotency of auto-creation
- Status lifecycle transitions and timestamp recording
- Mandatory rejection reason on rejected PDD item
- Ageing bucket computation (0-7, 8-15, 16-30, 30+ days) (FR-WFL-007)
- Optimistic locking version enforcement
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from app.modules.auth.models import User
from app.modules.cases.models import Case
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.pdd.models import PDDItem
from app.modules.pdd.schemas import (
    PDDItemUpdateRequest,
)
from app.modules.pdd.service import PDDService
from app.shared.exceptions import (
    BusinessRuleViolationError,
    ConflictError,
)


class MockPDDDbSession:
    """In-memory mock session for PDD testing."""

    def __init__(self) -> None:
        self.pdd_items: dict[uuid.UUID, PDDItem] = {}
        self.cases: dict[uuid.UUID, Case] = {}
        self.applications: dict[uuid.UUID, LenderApplication] = {}
        self.lenders: dict[uuid.UUID, Lender] = {}
        self.users: dict[uuid.UUID, User] = {}
        self.audit_events: list[dict[str, Any]] = []

    def add(self, entity: Any) -> None:
        now = datetime.now(UTC)
        if getattr(entity, "created_at", None) is None:
            entity.created_at = now
        if getattr(entity, "updated_at", None) is None:
            entity.updated_at = now

        if isinstance(entity, PDDItem):
            if entity.case_id in self.cases:
                entity.case = self.cases[entity.case_id]
            if entity.lender_application_id in self.applications:
                entity.lender_application = self.applications[entity.lender_application_id]
            if entity.owner_id in self.users:
                entity.owner = self.users[entity.owner_id]
            self.pdd_items[entity.id] = entity
        elif isinstance(entity, Case):
            self.cases[entity.id] = entity
        elif isinstance(entity, LenderApplication):
            if entity.lender_id in self.lenders:
                entity.lender = self.lenders[entity.lender_id]
            self.applications[entity.id] = entity
        elif isinstance(entity, Lender):
            self.lenders[entity.id] = entity
        elif isinstance(entity, User):
            self.users[entity.id] = entity
        else:
            self.audit_events.append(entity)

    async def flush(self) -> None:
        pass

    async def commit(self) -> None:
        pass

    async def refresh(self, entity: Any) -> None:
        if isinstance(entity, PDDItem):
            if entity.case_id in self.cases:
                entity.case = self.cases[entity.case_id]
            if entity.lender_application_id in self.applications:
                entity.lender_application = self.applications[entity.lender_application_id]
            if entity.owner_id in self.users:
                entity.owner = self.users[entity.owner_id]

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

            def all(self) -> list[Any]:
                return self._items

        if "from pdd_items" in stmt_str:
            matched = list(self.pdd_items.values())
            # Match specific ID
            for pid, it in self.pdd_items.items():
                if str(pid).lower() in stmt_str:
                    return MockResult([it])
            return MockResult(matched)
        elif "from cases" in stmt_str:
            return MockResult(list(self.cases.values()))
        elif "from lender_applications" in stmt_str:
            return MockResult(list(self.applications.values()))
        elif "from lenders" in stmt_str:
            return MockResult(list(self.lenders.values()))
        elif "from users" in stmt_str:
            return MockResult(list(self.users.values()))

        return MockResult([])


@pytest.mark.asyncio
class TestPDDModule:
    """Unit and domain rule tests for PDD items."""

    def _setup_disbursed_environment(self, db: MockPDDDbSession):
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        processor = User(
            id=user_id,
            org_id=org_id,
            name="Operations Officer",
            email="ops@example.com",
            mobile="9876543210",
            role="processor",
            password_hash="mock_hash",
        )
        db.add(processor)

        case = Case(
            id=uuid.uuid4(),
            org_id=org_id,
            case_no="LOS-PDD-001",
            product_type="used_car",
            status="disbursed",
            owner_id=processor.id,
            version=1,
        )
        db.add(case)

        lender = Lender(
            id=uuid.uuid4(),
            org_id=org_id,
            name="Kotak Mahindra Bank",
            code="KOTAK",
            type="bank",
            is_active=True,
        )
        db.add(lender)

        app = LenderApplication(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            lender_id=lender.id,
            product="used_car",
            status="disbursed",
            is_winning=True,
            disbursal_date=date.today(),
            version=1,
        )
        db.add(app)

        return org_id, processor, case, lender, app

    async def test_auto_create_pdd_items_on_disbursal(self):
        """FR-WFL-008: Verify standard 4 PDD items are created on loan disbursal."""
        db = MockPDDDbSession()
        org_id, processor, case, _, app = self._setup_disbursed_environment(db)
        service = PDDService(db)

        items = await service.auto_create_pdd_items_on_disbursal(
            org_id=org_id,
            case_id=case.id,
            application_id=app.id,
            disbursal_date=date.today(),
            actor_id=processor.id,
            actor_role=processor.role,
        )

        assert len(items) == 4
        doc_types = [it.document_type for it in items]
        assert "rc_hypothecation" in doc_types
        assert "insurance_clause" in doc_types
        assert "invoice_challan" in doc_types
        assert "form_34" in doc_types

        # Idempotency check: Calling again does not duplicate items
        items_second_call = await service.auto_create_pdd_items_on_disbursal(
            org_id=org_id,
            case_id=case.id,
            application_id=app.id,
            disbursal_date=date.today(),
            actor_id=processor.id,
            actor_role=processor.role,
        )
        assert len(items_second_call) == 4

    async def test_pdd_status_lifecycle_and_timestamps(self):
        """Verify lifecycle from pending -> collected -> sent_to_lender -> acknowledged."""
        db = MockPDDDbSession()
        org_id, processor, case, _, app = self._setup_disbursed_environment(db)
        service = PDDService(db)

        items = await service.auto_create_pdd_items_on_disbursal(
            org_id=org_id,
            case_id=case.id,
            application_id=app.id,
            disbursal_date=date.today(),
            actor_id=processor.id,
            actor_role=processor.role,
        )
        rc_item = next(it for it in items if it.document_type == "rc_hypothecation")

        # Step 1: Mark collected
        res_collected = await service.update_pdd_item(
            org_id=org_id,
            pdd_id=rc_item.id,
            payload=PDDItemUpdateRequest(status="collected", version=rc_item.version),
            actor_id=processor.id,
            actor_role=processor.role,
        )
        assert res_collected.status == "collected"
        assert res_collected.collected_at is not None

        # Step 2: Mark sent to lender
        res_sent = await service.update_pdd_item(
            org_id=org_id,
            pdd_id=rc_item.id,
            payload=PDDItemUpdateRequest(
                status="sent_to_lender",
                lender_acknowledgement_ref="COURIER-POD-109283",
                version=res_collected.version,
            ),
            actor_id=processor.id,
            actor_role=processor.role,
        )
        assert res_sent.status == "sent_to_lender"
        assert res_sent.submitted_to_lender_at is not None

        # Step 3: Bank acknowledges complete
        res_ack = await service.update_pdd_item(
            org_id=org_id,
            pdd_id=rc_item.id,
            payload=PDDItemUpdateRequest(
                status="acknowledged_by_lender",
                lender_acknowledgement_ref="BANK-ACK-4410",
                version=res_sent.version,
            ),
            actor_id=processor.id,
            actor_role=processor.role,
        )
        assert res_ack.status == "acknowledged_by_lender"
        assert res_ack.acknowledged_at is not None
        assert res_ack.is_overdue is False

    async def test_rejection_requires_reason(self):
        """Marking PDD item as rejected requires a rejection reason."""
        db = MockPDDDbSession()
        org_id, processor, case, _, app = self._setup_disbursed_environment(db)
        service = PDDService(db)

        items = await service.auto_create_pdd_items_on_disbursal(
            org_id=org_id,
            case_id=case.id,
            application_id=app.id,
            disbursal_date=date.today(),
            actor_id=processor.id,
            actor_role=processor.role,
        )
        rc_item = items[0]

        # Rejection without reason fails
        with pytest.raises(BusinessRuleViolationError) as exc:
            await service.update_pdd_item(
                org_id=org_id,
                pdd_id=rc_item.id,
                payload=PDDItemUpdateRequest(status="rejected", version=rc_item.version),
                actor_id=processor.id,
                actor_role=processor.role,
            )
        assert "PDD_REJECTION_REASON_REQUIRED" in str(exc.value.code)

        # Rejection with reason succeeds
        rejected = await service.update_pdd_item(
            org_id=org_id,
            pdd_id=rc_item.id,
            payload=PDDItemUpdateRequest(
                status="rejected",
                rejection_reason="Bank HP endorsement seal smudged / illegible on smart card",
                version=rc_item.version,
            ),
            actor_id=processor.id,
            actor_role=processor.role,
        )
        assert rejected.status == "rejected"
        assert "smudged" in rejected.rejection_reason

    async def test_optimistic_locking_conflict(self):
        """Version mismatch on PDD item update raises ConflictError (409)."""
        db = MockPDDDbSession()
        org_id, processor, case, _, app = self._setup_disbursed_environment(db)
        service = PDDService(db)

        items = await service.auto_create_pdd_items_on_disbursal(
            org_id=org_id,
            case_id=case.id,
            application_id=app.id,
            disbursal_date=date.today(),
            actor_id=processor.id,
            actor_role=processor.role,
        )
        rc_item = items[0]

        # Stale version
        with pytest.raises(ConflictError):
            await service.update_pdd_item(
                org_id=org_id,
                pdd_id=rc_item.id,
                payload=PDDItemUpdateRequest(status="collected", version=99),
                actor_id=processor.id,
                actor_role=processor.role,
            )

    async def test_pdd_board_ageing_buckets(self):
        """FR-WFL-007: Verify PDD board groups items into ageing buckets."""
        db = MockPDDDbSession()
        org_id, processor, case, _, app = self._setup_disbursed_environment(db)
        service = PDDService(db)

        now = datetime.now(UTC)

        # Create items in different age ranges
        # 1. Fresh item (created today -> 0_7)
        item_fresh = PDDItem(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            lender_application_id=app.id,
            document_type="invoice_challan",
            title="Fresh Invoice",
            status="pending",
            due_date=date.today() + timedelta(days=7),
            version=1,
            created_at=now,
            updated_at=now,
        )
        db.add(item_fresh)

        # 2. Amber item (created 10 days ago -> 8_15)
        item_amber = PDDItem(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            lender_application_id=app.id,
            document_type="insurance_clause",
            title="Amber Insurance",
            status="pending",
            due_date=date.today() + timedelta(days=5),
            version=1,
            created_at=now - timedelta(days=10),
            updated_at=now - timedelta(days=10),
        )
        db.add(item_amber)

        # 3. Orange item (created 20 days ago -> 16_30)
        item_orange = PDDItem(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            lender_application_id=app.id,
            document_type="form_34",
            title="Orange Form 34",
            status="pending",
            due_date=date.today() - timedelta(days=2),
            version=1,
            created_at=now - timedelta(days=20),
            updated_at=now - timedelta(days=20),
        )
        db.add(item_orange)

        # 4. Critical item (created 35 days ago -> 30_plus)
        item_critical = PDDItem(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            lender_application_id=app.id,
            document_type="rc_hypothecation",
            title="Critical RC Copy",
            status="pending",
            due_date=date.today() - timedelta(days=10),
            version=1,
            created_at=now - timedelta(days=35),
            updated_at=now - timedelta(days=35),
        )
        db.add(item_critical)

        board = await service.get_pdd_board(org_id=org_id)
        assert board.bucket_0_7_count >= 1
        assert board.bucket_8_15_count >= 1
        assert board.bucket_16_30_count >= 1
        assert board.bucket_30_plus_count >= 1
        assert board.total_pending >= 4
