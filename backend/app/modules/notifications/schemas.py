"""
DSA OS — Notifications Schemas

Pydantic schemas for notifications, user preferences, and delivery logs.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationItemResponse(BaseModel):
    """Single notification item."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    user_id: UUID
    event_type: str
    title: str
    message: str
    urgency: str
    entity_type: str
    entity_id: UUID | None = None
    deep_link: str | None = None
    is_read: bool
    read_at: datetime | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class NotificationListResponse(BaseModel):
    """Paginated notification response with unread count."""

    items: list[NotificationItemResponse]
    total: int
    unread_count: int
    page: int
    page_size: int


class NotificationCountResponse(BaseModel):
    """Unread and total badge count."""

    unread_count: int
    total_count: int


class NotificationPreferenceResponse(BaseModel):
    """User notification settings."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    in_app_enabled: bool
    email_enabled: bool
    digest_enabled: bool
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    disabled_event_types: list[str] = Field(default_factory=list)
    updated_at: datetime


class NotificationPreferenceUpdate(BaseModel):
    """Update payload for user notification preferences."""

    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    digest_enabled: bool | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    disabled_event_types: list[str] | None = None


class NotificationDeliveryLogResponse(BaseModel):
    """Delivery log entry per FR-NTF-004."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    notification_id: UUID
    channel: str
    status: str
    recipient: str
    error_message: str | None = None
    attempted_at: datetime
