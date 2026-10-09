"""
DSA OS — Notifications Router

Endpoints for managing user notifications, badge counts, delivery preferences, and audit logs.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.auth.models import User
from app.modules.notifications.schemas import (
    NotificationCountResponse,
    NotificationDeliveryLogResponse,
    NotificationItemResponse,
    NotificationListResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
)
from app.modules.notifications.service import NotificationService
from app.shared.schemas import ApiResponse

router = APIRouter(tags=["Notifications"])


@router.get("/notifications", response_model=ApiResponse[NotificationListResponse])
async def list_notifications(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    is_read: bool | None = Query(None, description="Filter by read/unread status"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[NotificationListResponse]:
    """List paginated notifications for current authenticated user."""
    service = NotificationService(session)
    items, total, unread = await service.list_notifications(
        org_id=current_user.org_id,
        user_id=current_user.id,
        is_read=is_read,
        page=page,
        page_size=page_size,
    )
    return ApiResponse(
        data=NotificationListResponse(
            items=[NotificationItemResponse.model_validate(item) for item in items],
            total=total,
            unread_count=unread,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/notifications/unread-count", response_model=ApiResponse[NotificationCountResponse])
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[NotificationCountResponse]:
    """Fetch unread count for top-bar badge."""
    service = NotificationService(session)
    items, total, unread = await service.list_notifications(
        org_id=current_user.org_id,
        user_id=current_user.id,
        is_read=None,
        page=1,
        page_size=1,
    )
    return ApiResponse(
        data=NotificationCountResponse(
            unread_count=unread,
            total_count=total,
        )
    )


@router.patch("/notifications/{notification_id}/read", response_model=ApiResponse[NotificationItemResponse])
async def mark_notification_as_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[NotificationItemResponse]:
    """Mark a notification as read."""
    service = NotificationService(session)
    notif = await service.mark_as_read(
        org_id=current_user.org_id,
        user_id=current_user.id,
        notification_id=notification_id,
    )
    await session.commit()
    return ApiResponse(data=NotificationItemResponse.model_validate(notif))


@router.post("/notifications/read-all", response_model=ApiResponse[dict[str, int]])
async def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict[str, int]]:
    """Mark all unread notifications for the user as read."""
    service = NotificationService(session)
    count = await service.mark_all_as_read(
        org_id=current_user.org_id,
        user_id=current_user.id,
    )
    await session.commit()
    return ApiResponse(data={"marked_read": count})


@router.get("/notifications/preferences", response_model=ApiResponse[NotificationPreferenceResponse])
async def get_preferences(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[NotificationPreferenceResponse]:
    """Fetch notification preferences for the current user."""
    service = NotificationService(session)
    prefs = await service.get_or_create_preferences(
        org_id=current_user.org_id,
        user_id=current_user.id,
    )
    return ApiResponse(data=NotificationPreferenceResponse.model_validate(prefs))


@router.put("/notifications/preferences", response_model=ApiResponse[NotificationPreferenceResponse])
async def update_preferences(
    payload: NotificationPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[NotificationPreferenceResponse]:
    """Update notification preferences for the current user."""
    service = NotificationService(session)
    prefs = await service.update_preferences(
        org_id=current_user.org_id,
        user_id=current_user.id,
        data=payload,
    )
    await session.commit()
    return ApiResponse(data=NotificationPreferenceResponse.model_validate(prefs))


@router.get("/notifications/logs", response_model=ApiResponse[list[NotificationDeliveryLogResponse]])
async def list_delivery_logs(
    notification_id: uuid.UUID | None = Query(None, description="Filter by notification ID"),
    limit: int = Query(50, ge=1, le=200, description="Max logs to return"),
    current_user: User = Depends(require_role("owner", "admin", "auditor")),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[NotificationDeliveryLogResponse]]:
    """FR-NTF-004 Delivery log per notification (Owner/Admin/Auditor)."""
    service = NotificationService(session)
    logs = await service.list_delivery_logs(
        org_id=current_user.org_id,
        notification_id=notification_id,
        limit=limit,
    )
    return ApiResponse(data=[NotificationDeliveryLogResponse.model_validate(log) for log in logs])


@router.post("/notifications/scan", response_model=ApiResponse[dict[str, Any]])
async def trigger_periodic_scan(
    current_user: User = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict[str, Any]]:
    """Trigger periodic scan for overdue tasks, stuck cases, and expiring documents."""
    service = NotificationService(session)
    counts = await service.scan_and_generate_periodic_notifications(org_id=current_user.org_id)
    await session.commit()
    return ApiResponse(data=counts)
