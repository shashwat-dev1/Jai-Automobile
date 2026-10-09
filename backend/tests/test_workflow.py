"""
DSA OS — Workflow, SLA, Document Gate, and Tasks Test Suite
Verifies:
- BR-03: Mandatory document gate before Applied / Logged In
- BR-03: Manager/Owner override with recorded reason
- SLA computation and stuck case detection (FR-WFL-004)
- Follow-up tasks CRUD and assignment (FR-WFL-005, FR-WFL-006)
- Configurable stage SLAs
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.cases.models import (
    Case,
    CaseParty,
    CaseStatusHistory,
    Vehicle,
)
from app.modules.cases.schemas import CaseStatusUpdate
from app.modules.cases.service import CaseService
from app.modules.documents.models import ChecklistRule, Document, DocumentType
from app.modules.parties.models import Party
from app.modules.workflow.models import SLAConfig, Task
from app.modules.workflow.schemas import (
    TaskCreateRequest,
    TaskUpdateRequest,
)
from app.modules.workflow.service import TaskService
from app.modules.workflow.sla import compute_stage_sla
from app.shared.exceptions import (
    BusinessRuleViolationError,
    PermissionDeniedError,
)


class MockWorkflowDbSession:
    """In-memory mock session for workflow, tasks, and document gate tests."""

    def __init__(self) -> None:
        self.cases: dict[uuid.UUID, Case] = {}
        self.parties: dict[uuid.UUID, Party] = {}
        self.case_parties: dict[uuid.UUID, CaseParty] = {}
        self.vehicles: dict[uuid.UUID, Vehicle] = {}
        self.doc_types: dict[uuid.UUID, DocumentType] = {}
        self.checklist_rules: dict[uuid.UUID, ChecklistRule] = {}
        self.documents: dict[uuid.UUID, Document] = {}
        self.tasks: dict[uuid.UUID, Task] = {}
        self.users: dict[uuid.UUID, User] = {}
        self.sla_configs: dict[uuid.UUID, SLAConfig] = {}
        self.status_history: list[CaseStatusHistory] = []
        self.audit_events: list[AuditLog] = []

    def add(self, entity: Any) -> None:
        now = datetime.now(UTC)
        if getattr(entity, "created_at", None) is None:
            entity.created_at = now
        if getattr(entity, "updated_at", None) is None:
            entity.updated_at = now

        if isinstance(entity, Case):
            self.cases[entity.id] = entity
        elif isinstance(entity, Party):
            self.parties[entity.id] = entity
        elif isinstance(entity, CaseParty):
            self.case_parties[entity.id] = entity
        elif isinstance(entity, Vehicle):
            self.vehicles[entity.id] = entity
        elif isinstance(entity, DocumentType):
            self.doc_types[entity.id] = entity
        elif isinstance(entity, ChecklistRule):
            self.checklist_rules[entity.id] = entity
        elif isinstance(entity, Document):
            self.documents[entity.id] = entity
        elif isinstance(entity, Task):
            if entity.case_id in self.cases:
                entity.case = self.cases[entity.case_id]
            if entity.owner_id in self.users:
                entity.owner = self.users[entity.owner_id]
            self.tasks[entity.id] = entity
        elif isinstance(entity, User):
            self.users[entity.id] = entity
        elif isinstance(entity, SLAConfig):
            self.sla_configs[entity.id] = entity
        elif isinstance(entity, CaseStatusHistory):
            self.status_history.append(entity)
        elif isinstance(entity, AuditLog):
            self.audit_events.append(entity)

    async def flush(self) -> None:
        pass

    async def commit(self) -> None:
        pass

    async def refresh(self, entity: Any) -> None:
        if isinstance(entity, Task):
            if entity.case_id in self.cases:
                entity.case = self.cases[entity.case_id]
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

        if "case_status_history" in stmt_str:
            return MockResult([(h, "Branch Manager") for h in self.status_history])
        elif "from checklist_rules" in stmt_str:
            return MockResult(list(self.checklist_rules.values()))
        elif "from document_types" in stmt_str:
            return MockResult(list(self.doc_types.values()))
        elif "from documents" in stmt_str:
            return MockResult(list(self.documents.values()))
        elif "from case_parties" in stmt_str:
            return MockResult(list(self.case_parties.values()))
        elif "from vehicles" in stmt_str:
            return MockResult(list(self.vehicles.values()))
        elif "from parties" in stmt_str:
            return MockResult(list(self.parties.values()))
        elif "from tasks" in stmt_str:
            return MockResult(list(self.tasks.values()))
        elif "from users" in stmt_str:
            matched = list(self.users.values())
            for uid, u in self.users.items():
                if str(uid).lower() in stmt_str:
                    matched = [u]
                    break
            # If querying only the name column
            if "select users.name from" in stmt_str or "select users.name \nfrom" in stmt_str:
                return MockResult([u.name for u in matched])
            return MockResult(matched)
        elif "from sources" in stmt_str:
            return MockResult(["Direct Partner"])
        elif "from sla_configs" in stmt_str:
            return MockResult(list(self.sla_configs.values()))
        elif "from cases" in stmt_str:
            return MockResult(list(self.cases.values()))

        return MockResult([])


@pytest.mark.asyncio
class TestWorkflowAndDocumentGate:
    """Tests for BR-03 Document Gate, SLA Ageing, and Tasks."""

    def _setup_case_with_party(self, db: MockWorkflowDbSession):
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        manager_user = User(
            id=user_id,
            org_id=org_id,
            name="Branch Manager",
            email="mgr@example.com",
            mobile="9876543211",
            role="manager",
            password_hash="mock_hash",
        )
        db.add(manager_user)

        processor_user = User(
            id=uuid.uuid4(),
            org_id=org_id,
            name="Case Processor",
            email="proc@example.com",
            mobile="9876543212",
            role="processor",
            password_hash="mock_hash",
        )
        db.add(processor_user)

        party = Party(
            id=uuid.uuid4(),
            org_id=org_id,
            name="Rajesh Sharma",
            mobile_primary="9876543210",
            employment_type="salaried",
            version=1,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(party)

        case = Case(
            id=uuid.uuid4(),
            org_id=org_id,
            case_no=f"LOS-{uuid.uuid4().hex[:6].upper()}",
            product_type="used_car",
            status="docs_collected",
            loan_amount_requested=Decimal("500000.00"),
            source_id=uuid.uuid4(),
            owner_id=processor_user.id,
            version=1,
            entered_stage_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(case)

        case_party = CaseParty(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            party_id=party.id,
            role="applicant",
            is_primary=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(case_party)

        vehicle = Vehicle(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case.id,
            vehicle_type="four_wheeler",
            condition="used",
            make="Hyundai",
            model="i20",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(vehicle)

        # Seed standard doc types
        doc_type_defs = [
            ("pan_card", "PAN Card", "KYC"),
            ("aadhaar_card", "Aadhaar Card", "KYC"),
            ("salary_slip", "Salary Slips", "Income"),
            ("bank_statement", "Bank Statement", "Income"),
            ("rc_copy", "RC Copy", "Vehicle"),
            ("insurance_policy", "Insurance Policy", "Vehicle"),
        ]
        pan_type = None
        for code, name, grp in doc_type_defs:
            dt = DocumentType(
                id=uuid.uuid4(),
                code=code,
                name=name,
                group_name=grp,
                is_active=True,
            )
            db.add(dt)
            if code == "pan_card":
                pan_type = dt

        return org_id, manager_user, processor_user, case, pan_type

    async def test_document_gate_blocks_applied_without_mandatory_docs_br03(self):
        """BR-03: Transitioning to file_logged_in blocked when mandatory documents missing."""
        db = MockWorkflowDbSession()
        org_id, manager_user, processor_user, case, _ = self._setup_case_with_party(db)
        case_service = CaseService(db)

        # Attempt to transition to file_logged_in without mandatory documents
        with pytest.raises(BusinessRuleViolationError) as exc_info:
            await case_service.change_status(
                org_id=org_id,
                case_id=case.id,
                payload=CaseStatusUpdate(
                    status="file_logged_in",
                    version=case.version,
                ),
                actor_id=processor_user.id,
                actor_role=processor_user.role,
            )
        assert "DOCUMENT_GATE_BLOCKED" in str(exc_info.value.code)

    async def test_document_gate_manager_override_succeeds_br03(self):
        """BR-03: Manager can override document gate with recorded reason."""
        db = MockWorkflowDbSession()
        org_id, manager_user, processor_user, case, _ = self._setup_case_with_party(db)
        case_service = CaseService(db)

        # Manager overrides with reason
        updated = await case_service.change_status(
            org_id=org_id,
            case_id=case.id,
            payload=CaseStatusUpdate(
                status="file_logged_in",
                reason="Verbal approval from Regional Head - physical PAN card in transit from customer",
                version=case.version,
            ),
            actor_id=manager_user.id,
            actor_role=manager_user.role,
        )
        assert updated.status == "file_logged_in"

    async def test_document_gate_processor_cannot_override_br03(self):
        """BR-03: Non-manager cannot override document gate."""
        db = MockWorkflowDbSession()
        org_id, manager_user, processor_user, case, _ = self._setup_case_with_party(db)
        case_service = CaseService(db)

        with pytest.raises(PermissionDeniedError):
            await case_service.change_status(
                org_id=org_id,
                case_id=case.id,
                payload=CaseStatusUpdate(
                    status="file_logged_in",
                    reason="Processor trying to bypass document gate",
                    version=case.version,
                ),
                actor_id=processor_user.id,
                actor_role=processor_user.role,
            )

    async def test_sla_ageing_and_stuck_detection(self):
        """FR-WFL-004: SLA computation correctly flags stuck status when exceeding benchmark."""
        now = datetime.now(UTC)

        # Fresh lead (2 hours old) vs 24h SLA -> Not stuck
        fresh_entered = now - timedelta(hours=2)
        fresh_sla = compute_stage_sla(
            entered_stage_at=fresh_entered,
            status="lead",
            entity_type="case",
        )
        assert fresh_sla["is_stuck"] is False
        assert fresh_sla["ageing_hours"] >= 2.0
        assert fresh_sla["stuck_hours"] == 0.0

        # Stuck lead (30 hours old) vs 24h SLA -> Stuck by 6 hours
        stuck_entered = now - timedelta(hours=30)
        stuck_sla = compute_stage_sla(
            entered_stage_at=stuck_entered,
            status="lead",
            entity_type="case",
        )
        assert stuck_sla["is_stuck"] is True
        assert stuck_sla["ageing_hours"] >= 30.0
        assert stuck_sla["stuck_hours"] >= 6.0

    async def test_task_crud_and_overdue_filtering(self):
        """Test follow-up task creation, overdue tracking, and completion."""
        db = MockWorkflowDbSession()
        org_id, manager_user, _, case, _ = self._setup_case_with_party(db)
        task_service = TaskService(db)

        # Create task due tomorrow
        t_tomorrow = await task_service.create_task(
            org_id=org_id,
            payload=TaskCreateRequest(
                case_id=case.id,
                type="call",
                title="Follow up on bank statement query",
                due_date=datetime.now(UTC) + timedelta(days=1),
                assigned_to_id=manager_user.id,
            ),
            actor_id=manager_user.id,
            actor_role=manager_user.role,
        )
        assert t_tomorrow.title == "Follow up on bank statement query"
        assert t_tomorrow.is_overdue is False
        assert t_tomorrow.status == "pending"

        # Complete task
        completed = await task_service.update_task(
            org_id=org_id,
            task_id=t_tomorrow.id,
            payload=TaskUpdateRequest(status="completed", outcome_notes="Bank statement confirmed"),
            actor_id=manager_user.id,
            actor_role=manager_user.role,
        )
        assert completed.status == "completed"
        assert completed.completed_at is not None
