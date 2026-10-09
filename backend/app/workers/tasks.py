"""DSA OS — ARQ Worker Configuration

Background task definitions and worker settings.
Implements Phase 03 document validation & quarantine promotion tasks,
and periodic cleanup tasks.
"""

import logging
import os
import uuid
from typing import Any

from sqlalchemy import select

from app.database import get_session_factory
from app.modules.documents.models import Document
from app.modules.documents.service import DocumentService
from app.modules.tenancy.rls import set_session_tenant_context

logger = logging.getLogger(__name__)


async def health_check_task(ctx: dict[str, Any]) -> str:
    """Periodic health check task."""
    logger.info("Worker health check: OK")
    return "ok"


async def validate_and_promote_document_task(
    ctx: dict[str, Any],
    org_id_str: str,
    document_id_str: str,
    user_id_str: str,
) -> dict[str, Any]:
    """Asynchronous background worker task for quarantine document validation.

    Sets tenant context, reads quarantine file, runs virus scan + MIME check + EXIF strip,
    and promotes to canonical private storage.
    """
    org_id = uuid.UUID(org_id_str)
    document_id = uuid.UUID(document_id_str)
    user_id = uuid.UUID(user_id_str)

    session_factory = get_session_factory()
    async with session_factory() as session:
        # Set tenant context for RLS
        await set_session_tenant_context(session, org_id)

        stmt = select(Document).where(Document.id == document_id, Document.org_id == org_id)
        res = await session.execute(stmt)
        doc = res.scalar_one_or_none()

        if not doc:
            logger.error("Document %s not found in org %s", document_id, org_id)
            return {"status": "not_found"}

        service = DocumentService(session)
        await service._run_validation_pipeline(doc, user_id)
        await session.commit()

        logger.info("Document %s validation complete with status: %s", document_id, doc.status)
        return {
            "document_id": str(document_id),
            "status": doc.status,
            "scan_error": doc.scan_error,
        }


async def cleanup_abandoned_quarantine_task(ctx: dict[str, Any]) -> int:
    """Periodic job to prune unconfirmed quarantine objects older than 24 hours."""
    logger.info("Running abandoned quarantine cleanup job")
    # Stub periodic cleanup
    return 0


async def scan_periodic_notifications_task(ctx: dict[str, Any], org_id_str: str) -> dict[str, int]:
    """Scan and generate overdue task, stuck case, and expiring document notifications."""
    from app.modules.notifications.service import NotificationService

    org_id = uuid.UUID(org_id_str)
    session_factory = get_session_factory()
    async with session_factory() as session:
        await set_session_tenant_context(session, org_id)
        service = NotificationService(session)
        counts = await service.scan_and_generate_periodic_notifications(org_id)
        await session.commit()
        logger.info("Generated periodic notifications for org %s: %s", org_id, counts)
        return counts


class WorkerSettings:
    """ARQ worker configuration."""

    redis_settings = None
    functions = [
        health_check_task,
        validate_and_promote_document_task,
        cleanup_abandoned_quarantine_task,
        scan_periodic_notifications_task,
    ]
    cron_jobs: list[Any] = []
    max_jobs = 10
    job_timeout = 300
    keep_result = 3600


try:
    from arq.connections import RedisSettings

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    WorkerSettings.redis_settings = RedisSettings.from_dsn(redis_url)
except ImportError:
    pass
