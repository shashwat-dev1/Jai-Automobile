"""
DSA OS — Audit Log Service

Handles immutable audit event logging, search, and CSV export.
"""

import csv
import io
import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog
from app.modules.tenancy.rls import set_session_tenant_context

logger = logging.getLogger(__name__)


class AuditService:
    """Operations for the append-only audit trail."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def log_event(
        self,
        org_id: uuid.UUID | None,
        action: str,
        entity_type: str,
        actor_id: uuid.UUID | None = None,
        actor_role: str | None = None,
        entity_id: str | None = None,
        changes: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        """Append an immutable audit entry."""
        if org_id:
            await set_session_tenant_context(self.session, org_id)

        entry = AuditLog(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            changes=changes,
            ip_address=ip_address[:45] if ip_address else None,
            user_agent=user_agent[:500] if user_agent else None,
        )
        self.session.add(entry)
        await self.session.commit()
        return entry

    async def search(
        self,
        org_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
        action: str | None = None,
        entity_type: str | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[AuditLog], int]:
        """Search audit records for an organization with pagination."""
        await set_session_tenant_context(self.session, org_id)

        stmt = select(AuditLog).where(AuditLog.org_id == org_id)
        count_stmt = select(func.count()).select_from(AuditLog).where(AuditLog.org_id == org_id)

        if actor_id:
            stmt = stmt.where(AuditLog.actor_id == actor_id)
            count_stmt = count_stmt.where(AuditLog.actor_id == actor_id)
        if action:
            stmt = stmt.where(AuditLog.action == action)
            count_stmt = count_stmt.where(AuditLog.action == action)
        if entity_type:
            stmt = stmt.where(AuditLog.entity_type == entity_type)
            count_stmt = count_stmt.where(AuditLog.entity_type == entity_type)
        if from_date:
            stmt = stmt.where(AuditLog.occurred_at >= from_date)
            count_stmt = count_stmt.where(AuditLog.occurred_at >= from_date)
        if to_date:
            stmt = stmt.where(AuditLog.occurred_at <= to_date)
            count_stmt = count_stmt.where(AuditLog.occurred_at <= to_date)

        # Count total
        total_res = await self.session.execute(count_stmt)
        total = total_res.scalar_one()

        # Order and paginate
        offset = (page - 1) * page_size
        stmt = stmt.order_by(AuditLog.occurred_at.desc()).offset(offset).limit(page_size)

        result = await self.session.execute(stmt)
        entries = list(result.scalars().all())

        return entries, total

    async def export_csv(
        self,
        org_id: uuid.UUID,
        actor_id: uuid.UUID | None = None,
        action: str | None = None,
        entity_type: str | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> str:
        """Export filtered audit trail as CSV formatted string."""
        entries, _ = await self.search(
            org_id=org_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            from_date=from_date,
            to_date=to_date,
            page=1,
            page_size=5000,  # Max export limit
        )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Timestamp (UTC)",
                "Actor ID",
                "Actor Role",
                "Action",
                "Entity Type",
                "Entity ID",
                "IP Address",
            ]
        )

        for entry in entries:
            writer.writerow(
                [
                    entry.occurred_at.isoformat(),
                    str(entry.actor_id) if entry.actor_id else "",
                    entry.actor_role or "",
                    entry.action,
                    entry.entity_type,
                    entry.entity_id or "",
                    entry.ip_address or "",
                ]
            )

        return output.getvalue()
