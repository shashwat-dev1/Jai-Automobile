"""DSA OS — Notifications Module."""

from app.modules.notifications.engine import register_notification_handlers
from app.modules.notifications.router import router

__all__ = ["router", "register_notification_handlers"]
