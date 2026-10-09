"""
DSA OS — Notification Service

Core business logic for notifications:
- Creating notifications with deduplication and preference filtering
- Multi-channel delivery and audit logging
- User read/unread status updates
- Preference configuration
- Periodic scanning for overdue tasks, stuck cases, expiring documents, and PDD items
"""

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.cases.models import Case
from app.modules.documents.models import Document
from app.modules.notifications.dedup import is_duplicate_notification, is_within_quiet_hours
from app.modules.notifications.dispatcher import dispatcher
from app.modules.notifications.models import (
    Notification,
    NotificationDeliveryLog,
    NotificationPreference,
)
from app.modules.notifications.schemas import NotificationPreferenceUpdate
from app.modules.pdd.models import PDDItem
from app.modules.workflow.models import Task
from app.shared.exceptions import NotFoundError, PermissionDeniedError

logger = logging.getLogger(__name__)


class NotificationService:
    """Encapsulates notification workflows and business rules."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create_preferences(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> NotificationPreference:
        """Fetch user preferences or initialize defaults."""
        stmt = select(NotificationPreference).where(
            NotificationPreference.org_id == org_id,
            NotificationPreference.user_id == user_id,
        )
        res = await self.db.execute(stmt)
        pref = res.scalar_one_or_none()

        if not pref:
            pref = NotificationPreference(
                id=uuid.uuid4(),
                org_id=org_id,
                user_id=user_id,
                in_app_enabled=True,
                email_enabled=True,
                digest_enabled=False,
                quiet_hours_start=None,
                quiet_hours_end=None,
                disabled_event_types=[],
            )
            self.db.add(pref)
            await self.db.flush()

        return pref

    async def update_preferences(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: NotificationPreferenceUpdate,
    ) -> NotificationPreference:
        """Update notification preferences for a user."""
        pref = await self.get_or_create_preferences(org_id, user_id)

        if data.in_app_enabled is not None:
            pref.in_app_enabled = data.in_app_enabled
        if data.email_enabled is not None:
            pref.email_enabled = data.email_enabled
        if data.digest_enabled is not None:
            pref.digest_enabled = data.digest_enabled
        if data.quiet_hours_start is not None:
            pref.quiet_hours_start = data.quiet_hours_start
        if data.quiet_hours_end is not None:
            pref.quiet_hours_end = data.quiet_hours_end
        if data.disabled_event_types is not None:
            pref.disabled_event_types = data.disabled_event_types

        await self.db.flush()
        return pref

    async def create_notification(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        event_type: str,
        title: str,
        message: str,
        urgency: str = "normal",
        entity_type: str = "case",
        entity_id: uuid.UUID | None = None,
        deep_link: str | None = None,
        payload: dict[str, Any] | None = None,
        dedup_window_minutes: int = 60,
    ) -> Notification | None:
        """
        Create and dispatch a notification.
        Applies deduplication, user opt-out preference checks, and quiet-hours logic.
        """
        # 1. Verify user exists
        user_stmt = select(User).where(User.id == user_id, User.org_id == org_id)
        user_res = await self.db.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        if not user or not user.is_active:
            logger.debug("Notification target user %s not found or inactive", user_id)
            return None

        # 2. Check preferences
        prefs = await self.get_or_create_preferences(org_id, user_id)
        if event_type in (prefs.disabled_event_types or []):
            logger.info("Notification event %s opted out by user %s", event_type, user_id)
            return None

        # 3. Check deduplication
        is_dup = await is_duplicate_notification(
            self.db,
            org_id=org_id,
            user_id=user_id,
            event_type=event_type,
            entity_id=entity_id,
            window_minutes=dedup_window_minutes,
        )
        if is_dup:
            logger.info(
                "Duplicate notification suppressed: event=%s, entity=%s, user=%s",
                event_type,
                entity_id,
                user_id,
            )
            return None

        # 4. Check quiet hours
        in_quiet_hours = is_within_quiet_hours(
            prefs.quiet_hours_start,
            prefs.quiet_hours_end,
        )

        # 5. Persist notification
        notif = Notification(
            id=uuid.uuid4(),
            org_id=org_id,
            user_id=user_id,
            event_type=event_type,
            title=title,
            message=message,
            urgency=urgency,
            entity_type=entity_type,
            entity_id=entity_id,
            deep_link=deep_link,
            is_read=False,
            read_at=None,
            payload=payload or {},
        )
        self.db.add(notif)
        await self.db.flush()

        # 6. Dispatch across channels
        await dispatcher.dispatch(
            notification=notif,
            user=user,
            preferences=prefs,
            db=self.db,
            in_quiet_hours=in_quiet_hours,
        )
        await self.db.flush()

        return notif

    async def list_notifications(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        is_read: bool | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Notification], int, int]:
        """
        List notifications for the current user, paginated.
        Returns: (items, total_count, unread_count)
        """
        base_filters = [
            Notification.org_id == org_id,
            Notification.user_id == user_id,
        ]

        if is_read is not None:
            base_filters.append(Notification.is_read == is_read)

        # Total matching
        total_stmt = select(func.count(Notification.id)).where(and_(*base_filters))
        total_res = await self.db.execute(total_stmt)
        total = total_res.scalar_one() or 0

        # Unread count
        unread_stmt = select(func.count(Notification.id)).where(
            Notification.org_id == org_id,
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
        unread_res = await self.db.execute(unread_stmt)
        unread_count = unread_res.scalar_one() or 0

        # Paginated items
        offset = (page - 1) * page_size
        items_stmt = (
            select(Notification)
            .where(and_(*base_filters))
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        items_res = await self.db.execute(items_stmt)
        items = list(items_res.scalars().all())

        return items, total, unread_count

    async def get_unread_count(self, org_id: uuid.UUID, user_id: uuid.UUID) -> int:
        """Quickly fetch number of unread notifications for badge counter."""
        stmt = select(func.count(Notification.id)).where(
            Notification.org_id == org_id,
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
        res = await self.db.execute(stmt)
        return res.scalar_one() or 0

    async def mark_as_read(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        notification_id: uuid.UUID,
    ) -> Notification:
        """Mark a single notification as read."""
        stmt = select(Notification).where(
            Notification.id == notification_id,
            Notification.org_id == org_id,
        )
        res = await self.db.execute(stmt)
        notif = res.scalar_one_or_none()

        if not notif:
            raise NotFoundError("Notification", str(notification_id))

        if notif.user_id != user_id:
            raise PermissionDeniedError("Cannot mark another user's notification as read")

        if not notif.is_read:
            notif.is_read = True
            notif.read_at = datetime.now(UTC)
            await self.db.flush()

        return notif

    async def mark_all_as_read(self, org_id: uuid.UUID, user_id: uuid.UUID) -> int:
        """Mark all unread notifications for the user as read."""
        now = datetime.now(UTC)
        stmt = (
            update(Notification)
            .where(
                Notification.org_id == org_id,
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True, read_at=now)
        )
        res = await self.db.execute(stmt)
        await self.db.flush()
        return res.rowcount or 0

    async def list_delivery_logs(
        self,
        org_id: uuid.UUID,
        notification_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[NotificationDeliveryLog]:
        """Audit trail for notification deliveries."""
        filters = [NotificationDeliveryLog.org_id == org_id]
        if notification_id:
            filters.append(NotificationDeliveryLog.notification_id == notification_id)

        stmt = (
            select(NotificationDeliveryLog)
            .where(and_(*filters))
            .order_by(NotificationDeliveryLog.attempted_at.desc())
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def scan_and_generate_periodic_notifications(
        self,
        org_id: uuid.UUID,
    ) -> dict[str, int]:
        """
        Background scanner for overdue tasks, stuck cases, expiring docs, and PDD deadlines.
        """
        counts = {
            "tasks_overdue": 0,
            "tasks_due_today": 0,
            "stuck_cases": 0,
            "expiring_documents": 0,
            "due_pdd_items": 0,
        }

        today = date.today()
        now = datetime.now(UTC)

        # 1. Overdue & Due Tasks
        tasks_stmt = select(Task).where(
            Task.org_id == org_id,
            Task.status.in_(["pending", "in_progress"]),
        )
        tasks_res = await self.db.execute(tasks_stmt)
        for task in tasks_res.scalars().all():
            if task.due_date < today:
                # Overdue
                notif = await self.create_notification(
                    org_id=org_id,
                    user_id=task.owner_id,
                    event_type="task.overdue",
                    title="Task Overdue",
                    message=f"Follow-up task '{task.title}' was due on {task.due_date.isoformat()}.",
                    urgency="high",
                    entity_type="task",
                    entity_id=task.id,
                    deep_link=f"/cases/{task.case_id}" if task.case_id else "/tasks",
                )
                if notif:
                    counts["tasks_overdue"] += 1
            elif task.due_date == today:
                # Due today
                notif = await self.create_notification(
                    org_id=org_id,
                    user_id=task.owner_id,
                    event_type="task.due_today",
                    title="Task Due Today",
                    message=f"Follow-up task '{task.title}' is scheduled for today.",
                    urgency="normal",
                    entity_type="task",
                    entity_id=task.id,
                    deep_link=f"/cases/{task.case_id}" if task.case_id else "/tasks",
                )
                if notif:
                    counts["tasks_due_today"] += 1

        # 2. Expiring Documents (within 7 days)
        doc_threshold = now + timedelta(days=7)
        docs_stmt = select(Document).where(
            Document.org_id == org_id,
            Document.expires_at.is_not(None),
            Document.expires_at <= doc_threshold,
            Document.expires_at >= now,
            Document.status != "archived",
        )
        docs_res = await self.db.execute(docs_stmt)
        for doc in docs_res.scalars().all():
            # Notify case owner
            case_stmt = select(Case).where(Case.id == doc.case_id, Case.org_id == org_id)
            case_res = await self.db.execute(case_stmt)
            case = case_res.scalar_one_or_none()
            if case:
                notif = await self.create_notification(
                    org_id=org_id,
                    user_id=case.owner_id,
                    event_type="document.expiring",
                    title="Document Expiring Soon",
                    message=f"Document '{doc.file_name}' for Case #{case.case_no} expires on {doc.expires_at.date().isoformat() if doc.expires_at else 'soon'}.",
                    urgency="high",
                    entity_type="document",
                    entity_id=doc.id,
                    deep_link=f"/cases/{case.id}",
                )
                if notif:
                    counts["expiring_documents"] += 1

        # 3. PDD Items Overdue or Due within 3 days
        pdd_threshold = today + timedelta(days=3)
        pdd_stmt = select(PDDItem).where(
            PDDItem.org_id == org_id,
            PDDItem.status == "pending",
            PDDItem.due_date <= pdd_threshold,
        )
        pdd_res = await self.db.execute(pdd_stmt)
        for pdd in pdd_res.scalars().all():
            owner_id = pdd.owner_id
            if not owner_id:
                # Fallback to case owner
                c_stmt = select(Case).where(Case.id == pdd.case_id, Case.org_id == org_id)
                c_res = await self.db.execute(c_stmt)
                c = c_res.scalar_one_or_none()
                owner_id = c.owner_id if c else None

            if owner_id:
                is_overdue = pdd.due_date < today
                notif = await self.create_notification(
                    org_id=org_id,
                    user_id=owner_id,
                    event_type="pdd_item.overdue" if is_overdue else "pdd_item.due",
                    title=f"PDD Item {'Overdue' if is_overdue else 'Due Soon'}",
                    message=f"Post-disbursal document '{pdd.title}' is due on {pdd.due_date.isoformat()}.",
                    urgency="high" if is_overdue else "normal",
                    entity_type="pdd_item",
                    entity_id=pdd.id,
                    deep_link=f"/cases/{pdd.case_id}",
                )
                if notif:
                    counts["due_pdd_items"] += 1

        # 4. Stuck Cases (> stage SLA)
        from app.modules.workflow.models import SLAConfig

        sla_res = await self.db.execute(
            select(SLAConfig).where(SLAConfig.org_id == org_id, SLAConfig.is_active.is_(True))
        )
        sla_map = {s.status: s.sla_hours for s in sla_res.scalars().all()}

        active_cases_stmt = select(Case).where(
            Case.org_id == org_id,
            Case.status.not_in(["closed", "rejected", "withdrawn"]),
        )
        active_cases_res = await self.db.execute(active_cases_stmt)
        for c in active_cases_res.scalars().all():
            c_entered = c.entered_stage_at or c.created_at or now
            diff_hours = (now - c_entered).total_seconds() / 3600.0
            sla_hours = sla_map.get(c.status, 48)
            if diff_hours > sla_hours:
                notif = await self.create_notification(
                    org_id=org_id,
                    user_id=c.owner_id,
                    event_type="case.stuck",
                    title="Case Bottleneck / Stuck",
                    message=f"Case #{c.case_no} has exceeded stage SLA in stage '{c.status}'.",
                    urgency="high",
                    entity_type="case",
                    entity_id=c.id,
                    deep_link=f"/cases/{c.id}",
                )
                if notif:
                    counts["stuck_cases"] += 1

        return counts
