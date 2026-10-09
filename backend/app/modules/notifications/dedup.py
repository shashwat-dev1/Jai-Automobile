"""
DSA OS — Notification Deduplication & Quiet Hours

Implements FR-NTF-003 duplicate suppression and quiet hours evaluation.
"""

import uuid
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.models import Notification


async def is_duplicate_notification(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    event_type: str,
    entity_id: uuid.UUID | None,
    window_minutes: int = 60,
) -> bool:
    """
    Check if a notification with the same event_type, entity_id, and user_id
    already exists within the deduplication window (default 60 minutes).
    """
    if entity_id is None:
        return False

    threshold = datetime.now(UTC) - timedelta(minutes=window_minutes)

    stmt = (
        select(Notification.id)
        .where(
            Notification.org_id == org_id,
            Notification.user_id == user_id,
            Notification.event_type == event_type,
            Notification.entity_id == entity_id,
            Notification.created_at >= threshold,
        )
        .limit(1)
    )

    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


def is_within_quiet_hours(
    quiet_hours_start: str | None,
    quiet_hours_end: str | None,
    now: datetime | None = None,
) -> bool:
    """
    Check if the current time falls within user-specified quiet hours.
    Format of start and end: "HH:MM" (24-hour clock, e.g. "22:00" and "07:00").
    Supports overnight intervals.
    """
    if not quiet_hours_start or not quiet_hours_end:
        return False

    try:
        sh, sm = map(int, quiet_hours_start.strip().split(":"))
        eh, em = map(int, quiet_hours_end.strip().split(":"))
        start_time = time(sh, sm)
        end_time = time(eh, em)
    except (ValueError, AttributeError):
        return False

    current_dt = now or datetime.now(UTC)
    current_time = current_dt.time()

    if start_time <= end_time:
        return start_time <= current_time <= end_time
    else:
        # Overnight interval: e.g. 22:00 to 07:00
        return current_time >= start_time or current_time <= end_time
