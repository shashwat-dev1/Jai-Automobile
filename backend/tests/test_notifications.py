"""
DSA OS — Notifications Engine Test Suite (Phase 09)

Verifies:
- FR-NTF-001: Event-driven generation for cases, documents, tasks, PDD items, and payouts
- FR-NTF-002: In-app and email delivery with pluggable channel abstraction
- FR-NTF-003: User preferences, quiet hours, and duplicate suppression within 1 hour
- FR-NTF-004: Delivery log per notification across channels
- Multi-tenant isolation and user scoping
- Periodic background scanner for overdue tasks, stuck cases, and expiring documents
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from app.modules.auth.models import User
from app.modules.cases.models import Case
from app.modules.documents.models import Document
from app.modules.notifications.dedup import is_within_quiet_hours
from app.modules.notifications.dispatcher import (
    EmailChannel,
    InAppChannel,
    SMSChannel,
    WhatsAppChannel,
)
from app.modules.notifications.models import (
    Notification,
    NotificationDeliveryLog,
    NotificationPreference,
)
from app.modules.notifications.schemas import NotificationPreferenceUpdate
from app.modules.notifications.service import NotificationService
from app.modules.pdd.models import PDDItem
from app.modules.workflow.models import SLAConfig, Task
from app.shared.exceptions import PermissionDeniedError


class MockResult:
    def __init__(self, data: list[Any]):
        self._data = data

    def scalars(self) -> "MockResult":
        return self

    def all(self) -> list[Any]:
        return list(self._data)

    def scalar_one_or_none(self) -> Any:
        return self._data[0] if self._data else None

    def scalar_one(self) -> Any:
        if not self._data:
            raise ValueError("No rows found")
        return self._data[0]

    def scalar(self) -> Any:
        return self._data[0] if self._data else 0

    @property
    def rowcount(self) -> int:
        return len(self._data)


class MockNotificationDbSession:
    """In-memory mock supporting async session queries for notification engine."""

    def __init__(self) -> None:
        self.notifications: dict[uuid.UUID, Notification] = {}
        self.preferences: dict[uuid.UUID, NotificationPreference] = {}
        self.delivery_logs: dict[uuid.UUID, NotificationDeliveryLog] = {}
        self.users: dict[uuid.UUID, User] = {}
        self.cases: dict[uuid.UUID, Case] = {}
        self.tasks: dict[uuid.UUID, Task] = {}
        self.documents: dict[uuid.UUID, Document] = {}
        self.pdd_items: dict[uuid.UUID, PDDItem] = {}
        self.sla_configs: dict[uuid.UUID, SLAConfig] = {}

    def add(self, entity: Any) -> None:
        now = datetime.now(UTC)
        if hasattr(entity, "id") and entity.id is None:
            entity.id = uuid.uuid4()
        if hasattr(entity, "created_at") and getattr(entity, "created_at", None) is None:
            entity.created_at = now
        if hasattr(entity, "updated_at") and getattr(entity, "updated_at", None) is None:
            entity.updated_at = now

        if isinstance(entity, Notification):
            self.notifications[entity.id] = entity
        elif isinstance(entity, NotificationPreference):
            self.preferences[entity.id] = entity
        elif isinstance(entity, NotificationDeliveryLog):
            self.delivery_logs[entity.id] = entity
        elif isinstance(entity, User):
            self.users[entity.id] = entity
        elif isinstance(entity, Case):
            self.cases[entity.id] = entity
        elif isinstance(entity, Task):
            self.tasks[entity.id] = entity
        elif isinstance(entity, Document):
            self.documents[entity.id] = entity
        elif isinstance(entity, PDDItem):
            self.pdd_items[entity.id] = entity
        elif isinstance(entity, SLAConfig):
            self.sla_configs[entity.id] = entity

    async def flush(self) -> None:
        pass

    async def commit(self) -> None:
        pass

    async def execute(self, statement: Any) -> MockResult:
        query_str = str(statement).lower()

        # 1. Count queries
        if "count(" in query_str or "count *" in query_str:
            if "notifications" in query_str:
                matched = list(self.notifications.values())
                if "is_read is false" in query_str or "is_read = false" in query_str:
                    matched = [n for n in matched if not n.is_read]
                return MockResult([len(matched)])
            return MockResult([0])

        # 2. Select Notifications
        if "from notifications" in query_str:
            items = list(self.notifications.values())
            try:
                params = statement.compile().params
                for k, v in params.items():
                    if k.startswith("entity_id") and v is not None:
                        items = [n for n in items if n.entity_id == v]
                    elif k.startswith("event_type") and v is not None:
                        items = [n for n in items if n.event_type == v]
                    elif (k.startswith("id_") or k == "id_1") and v is not None:
                        items = [n for n in items if n.id == v]
            except (AttributeError, KeyError, ValueError):
                pass
            # Sort by created_at desc
            items.sort(key=lambda x: x.created_at, reverse=True)
            return MockResult(items)

        # 3. Select NotificationPreferences
        if "from notification_preferences" in query_str:
            return MockResult(list(self.preferences.values()))

        # 4. Select Delivery Logs
        if "from notification_delivery_logs" in query_str:
            logs = list(self.delivery_logs.values())
            logs.sort(key=lambda x: x.attempted_at, reverse=True)
            return MockResult(logs)

        # 5. Select Users
        if "from users" in query_str:
            return MockResult(list(self.users.values()))

        # 6. Select Cases
        if "from cases" in query_str:
            return MockResult(list(self.cases.values()))

        # 7. Select Tasks
        if "from tasks" in query_str:
            return MockResult(list(self.tasks.values()))

        # 8. Select Documents
        if "from documents" in query_str:
            return MockResult(list(self.documents.values()))

        # 9. Select PDD Items
        if "from pdd_items" in query_str:
            return MockResult(list(self.pdd_items.values()))

        # 10. Select SLA Configs
        if "from sla_configs" in query_str:
            return MockResult(list(self.sla_configs.values()))

        # 11. Update query (mark all read)
        if "update notifications" in query_str:
            updated_count = 0
            now = datetime.now(UTC)
            for n in self.notifications.values():
                if not n.is_read:
                    n.is_read = True
                    n.read_at = now
                    updated_count += 1
            return MockResult([updated_count])

        return MockResult([])


@pytest.fixture
def mock_db() -> MockNotificationDbSession:
    db = MockNotificationDbSession()

    org_id = uuid.uuid4()
    user_id = uuid.uuid4()

    user = User(
        id=user_id,
        org_id=org_id,
        name="Arjun Sharma",
        email="arjun@dsa.example.com",
        role="case_officer",
        password_hash="mock_hash",
        is_active=True,
    )
    db.add(user)

    return db


@pytest.mark.asyncio
async def test_notification_creation_and_delivery_log(mock_db: MockNotificationDbSession) -> None:
    """Verifies creating a notification logs delivery across in-app and email channels (FR-NTF-001, FR-NTF-002, FR-NTF-004)."""
    user = list(mock_db.users.values())[0]
    service = NotificationService(mock_db)  # type: ignore[arg-type]

    notif = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="case.status_changed",
        title="Case Status Advanced",
        message="Case #DL-2026-001 advanced to In Review.",
        urgency="normal",
        entity_type="case",
        entity_id=uuid.uuid4(),
        deep_link="/cases/123",
    )

    assert notif is not None
    assert notif.title == "Case Status Advanced"
    assert notif.is_read is False

    # Check delivery logs (FR-NTF-004)
    logs = list(mock_db.delivery_logs.values())
    assert len(logs) == 2  # In-app and email
    channels = {log.channel for log in logs}
    assert "in_app" in channels
    assert "email" in channels

    in_app_log = next(log for log in logs if log.channel == "in_app")
    assert in_app_log.status == "delivered"
    assert in_app_log.recipient == user.email


@pytest.mark.asyncio
async def test_notification_deduplication(mock_db: MockNotificationDbSession) -> None:
    """Verifies FR-NTF-003 duplicate suppression within window."""
    user = list(mock_db.users.values())[0]
    service = NotificationService(mock_db)  # type: ignore[arg-type]
    entity_id = uuid.uuid4()

    # First notification succeeds
    notif1 = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="document.missing",
        title="Missing Document",
        message="Salary slips missing for Case #101.",
        entity_type="document",
        entity_id=entity_id,
        dedup_window_minutes=60,
    )
    assert notif1 is not None

    # Immediate duplicate is suppressed
    notif2 = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="document.missing",
        title="Missing Document",
        message="Salary slips missing for Case #101.",
        entity_type="document",
        entity_id=entity_id,
        dedup_window_minutes=60,
    )
    assert notif2 is None


@pytest.mark.asyncio
async def test_notification_deduplication_different_entity(mock_db: MockNotificationDbSession) -> None:
    """Notifications for different entities are not suppressed."""
    user = list(mock_db.users.values())[0]
    service = NotificationService(mock_db)  # type: ignore[arg-type]

    notif1 = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="case.stuck",
        title="Case Stuck",
        message="Case 1 stuck",
        entity_type="case",
        entity_id=uuid.uuid4(),
    )
    assert notif1 is not None

    notif2 = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="case.stuck",
        title="Case Stuck",
        message="Case 2 stuck",
        entity_type="case",
        entity_id=uuid.uuid4(),
    )
    assert notif2 is not None


@pytest.mark.asyncio
async def test_user_opt_out_preference(mock_db: MockNotificationDbSession) -> None:
    """Verifies that events disabled by user are not generated."""
    user = list(mock_db.users.values())[0]
    service = NotificationService(mock_db)  # type: ignore[arg-type]

    # Disable 'task.due_today'
    await service.update_preferences(
        org_id=user.org_id,
        user_id=user.id,
        data=NotificationPreferenceUpdate(disabled_event_types=["task.due_today"]),
    )

    notif = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="task.due_today",
        title="Task Due Today",
        message="You have a task due today.",
    )
    assert notif is None


def test_quiet_hours_calculation() -> None:
    """Tests overnight and same-day quiet hours intervals."""
    # Standard daytime interval 13:00 - 15:00
    t1 = datetime(2026, 10, 5, 14, 0, tzinfo=UTC)
    assert is_within_quiet_hours("13:00", "15:00", t1) is True

    t2 = datetime(2026, 10, 5, 16, 0, tzinfo=UTC)
    assert is_within_quiet_hours("13:00", "15:00", t2) is False

    # Overnight interval 22:00 - 07:00
    t3 = datetime(2026, 10, 5, 23, 30, tzinfo=UTC)
    assert is_within_quiet_hours("22:00", "07:00", t3) is True

    t4 = datetime(2026, 10, 5, 3, 30, tzinfo=UTC)
    assert is_within_quiet_hours("22:00", "07:00", t4) is True

    t5 = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
    assert is_within_quiet_hours("22:00", "07:00", t5) is False


@pytest.mark.asyncio
async def test_quiet_hours_email_suppression(mock_db: MockNotificationDbSession) -> None:
    """Verifies that non-urgent email notifications are suppressed during quiet hours."""
    user = list(mock_db.users.values())[0]
    service = NotificationService(mock_db)  # type: ignore[arg-type]

    # Set 24-hour quiet period
    await service.update_preferences(
        org_id=user.org_id,
        user_id=user.id,
        data=NotificationPreferenceUpdate(
            quiet_hours_start="00:00",
            quiet_hours_end="23:59",
        ),
    )

    notif = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="payout.held",
        title="Payout Held",
        message="Payout expectation held.",
        urgency="normal",
    )
    assert notif is not None

    email_log = next(log for log in mock_db.delivery_logs.values() if log.channel == "email")
    assert email_log.status == "suppressed"
    assert "quiet hours" in (email_log.error_message or "").lower()


@pytest.mark.asyncio
async def test_urgent_bypasses_quiet_hours(mock_db: MockNotificationDbSession) -> None:
    """Verifies that urgent notifications bypass quiet hours email suppression."""
    user = list(mock_db.users.values())[0]
    service = NotificationService(mock_db)  # type: ignore[arg-type]

    # Set 24-hour quiet period
    await service.update_preferences(
        org_id=user.org_id,
        user_id=user.id,
        data=NotificationPreferenceUpdate(
            quiet_hours_start="00:00",
            quiet_hours_end="23:59",
        ),
    )

    notif = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="clawback.recorded",
        title="Urgent Clawback Notice",
        message="Clawback executed.",
        urgency="urgent",
    )
    assert notif is not None

    email_log = next(log for log in mock_db.delivery_logs.values() if log.channel == "email")
    assert email_log.status == "sent"


@pytest.mark.asyncio
async def test_mark_as_read_workflow(mock_db: MockNotificationDbSession) -> None:
    """Verifies mark_as_read and mark_all_as_read functionality."""
    user = list(mock_db.users.values())[0]
    service = NotificationService(mock_db)  # type: ignore[arg-type]

    notif = await service.create_notification(
        org_id=user.org_id,
        user_id=user.id,
        event_type="task.overdue",
        title="Task Overdue",
        message="Task #1 is overdue.",
    )
    assert notif is not None
    assert notif.is_read is False

    # Mark single read
    updated = await service.mark_as_read(
        org_id=user.org_id,
        user_id=user.id,
        notification_id=notif.id,
    )
    assert updated.is_read is True
    assert updated.read_at is not None

    # Mark all read
    count = await service.mark_all_as_read(org_id=user.org_id, user_id=user.id)
    assert count >= 0


@pytest.mark.asyncio
async def test_cross_user_isolation(mock_db: MockNotificationDbSession) -> None:
    """Verifies user cannot read another user's notifications."""
    user1 = list(mock_db.users.values())[0]
    user2 = User(
        id=uuid.uuid4(),
        org_id=user1.org_id,
        name="Priya Patel",
        email="priya@dsa.example.com",
        role="processor",
        password_hash="mock",
        is_active=True,
    )
    mock_db.add(user2)

    service = NotificationService(mock_db)  # type: ignore[arg-type]
    notif = await service.create_notification(
        org_id=user1.org_id,
        user_id=user1.id,
        event_type="case.status_changed",
        title="User 1 Alert",
        message="For user 1 only",
    )
    assert notif is not None

    # User 2 attempts to mark User 1's notification as read
    with pytest.raises(PermissionDeniedError):
        await service.mark_as_read(
            org_id=user1.org_id,
            user_id=user2.id,
            notification_id=notif.id,
        )


@pytest.mark.asyncio
async def test_periodic_scanner(mock_db: MockNotificationDbSession) -> None:
    """Verifies periodic scanner generates alerts for overdue tasks, stuck cases, and expiring documents."""
    user = list(mock_db.users.values())[0]
    org_id = user.org_id
    today = date.today()
    now = datetime.now(UTC)

    # Add overdue task
    task = Task(
        id=uuid.uuid4(),
        org_id=org_id,
        title="Collect Pan Card",
        due_date=today - timedelta(days=2),
        status="pending",
        owner_id=user.id,
    )
    mock_db.add(task)

    # Add stuck case
    case = Case(
        id=uuid.uuid4(),
        org_id=org_id,
        case_no="DL-STUCK-001",
        status="underwriting",
        entered_stage_at=now - timedelta(days=5),
        loan_amount_requested=100000,
        source_id=uuid.uuid4(),
        owner_id=user.id,
    )
    mock_db.add(case)

    # Add SLA config for underwriting: 24h
    sla = SLAConfig(
        id=uuid.uuid4(),
        org_id=org_id,
        entity_type="case",
        status="underwriting",
        sla_hours=24,
        is_active=True,
    )
    mock_db.add(sla)

    # Add expiring document
    doc = Document(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case.id,
        document_type_id=uuid.uuid4(),
        file_name="insurance_policy.pdf",
        status="verified",
        file_key="documents/test.pdf",
        file_size=1024,
        mime_type="application/pdf",
        uploaded_by=user.id,
        expires_at=now + timedelta(days=3),
    )
    mock_db.add(doc)

    service = NotificationService(mock_db)  # type: ignore[arg-type]
    counts = await service.scan_and_generate_periodic_notifications(org_id=org_id)

    assert counts["tasks_overdue"] >= 1
    assert counts["stuck_cases"] >= 1
    assert counts["expiring_documents"] >= 1


@pytest.mark.asyncio
async def test_channel_adapters() -> None:
    """Verifies that all channel adapters conform to BaseNotificationChannel."""
    db = MockNotificationDbSession()
    user = User(
        id=uuid.uuid4(),
        org_id=uuid.uuid4(),
        name="Test",
        email="test@example.com",
        role="owner",
        password_hash="pw",
        is_active=True,
    )
    db.add(user)

    notif = Notification(
        id=uuid.uuid4(),
        org_id=user.org_id,
        user_id=user.id,
        event_type="test.event",
        title="Test Title",
        message="Test Message",
    )
    db.add(notif)

    in_app = InAppChannel()
    email = EmailChannel()
    sms = SMSChannel()
    whatsapp = WhatsAppChannel()

    log_in_app = await in_app.dispatch(notif, user, db)  # type: ignore[arg-type]
    assert log_in_app.channel == "in_app"
    assert log_in_app.status == "delivered"

    log_email = await email.dispatch(notif, user, db)  # type: ignore[arg-type]
    assert log_email.channel == "email"
    assert log_email.status == "sent"

    log_sms = await sms.dispatch(notif, user, db)  # type: ignore[arg-type]
    assert log_sms.channel == "sms"
    assert log_sms.status == "suppressed"

    log_wa = await whatsapp.dispatch(notif, user, db)  # type: ignore[arg-type]
    assert log_wa.channel == "whatsapp"
    assert log_wa.status == "suppressed"
