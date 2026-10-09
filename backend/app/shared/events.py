"""
DSA OS — Internal Event Bus

Lightweight synchronous event bus for intra-module communication.
Designed to be async-ready for future migration to a proper message broker.

Design decisions:
- Phase 00: synchronous in-process events only
- Events are emitted after successful database operations
- Handlers are registered at application startup
- Each handler runs in order; failures are logged but do not roll back the operation
- Future: replace with proper async queue (ARQ) when needed
"""

import logging
from collections import defaultdict
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class DomainEvent:
    """Base class for all domain events."""

    event_type: str
    org_id: str
    actor_id: str | None
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, Any] = field(default_factory=dict)


# Type alias for event handler
EventHandler = Callable[[DomainEvent], Coroutine[Any, Any, None]]


class EventBus:
    """
    Simple async-capable internal event bus.

    Usage:
        # Register a handler
        @event_bus.on("case.status_changed")
        async def handle_case_status(event: DomainEvent) -> None:
            await send_notification(event)

        # Emit an event
        await event_bus.emit(DomainEvent(
            event_type="case.status_changed",
            org_id=str(org_id),
            actor_id=str(user_id),
            payload={"case_id": str(case_id), "from": old_status, "to": new_status},
        ))
    """

    def __init__(self) -> None:
        self._handlers: dict[str, list[EventHandler]] = defaultdict(list)

    def on(self, event_type: str) -> Callable[[EventHandler], EventHandler]:
        """Decorator to register an event handler."""

        def decorator(handler: EventHandler) -> EventHandler:
            self._handlers[event_type].append(handler)
            logger.debug("Registered handler %s for event '%s'", handler.__name__, event_type)
            return handler

        return decorator

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        """Programmatically subscribe a handler."""
        self._handlers[event_type].append(handler)

    async def emit(self, event: DomainEvent) -> None:
        """
        Emit an event to all registered handlers.

        Handlers are called sequentially. Failures are logged but do not
        propagate — event emission must not break the originating operation.
        """
        handlers = self._handlers.get(event.event_type, [])
        if not handlers:
            logger.debug("No handlers for event '%s'", event.event_type)
            return

        for handler in handlers:
            try:
                await handler(event)
            except Exception:
                logger.exception(
                    "Event handler %s failed for event '%s' on org '%s'",
                    handler.__name__,
                    event.event_type,
                    event.org_id,
                )

    def clear(self) -> None:
        """Clear all handlers — used in tests."""
        self._handlers.clear()


# Module-level singleton event bus
event_bus = EventBus()


# =============================================================================
# Standard Event Types (constants)
# Register your handlers against these strings.
# =============================================================================


class EventTypes:
    """Domain event type constants. Use these instead of raw strings."""

    # Auth
    USER_LOGIN = "auth.user_login"
    USER_LOGOUT = "auth.user_logout"
    USER_LOGIN_FAILED = "auth.user_login_failed"
    USER_LOCKED = "auth.user_locked"
    USER_DEACTIVATED = "auth.user_deactivated"
    USER_ROLE_CHANGED = "auth.user_role_changed"

    # Cases
    CASE_CREATED = "case.created"
    CASE_STATUS_CHANGED = "case.status_changed"
    CASE_ASSIGNED = "case.assigned"

    # Documents
    DOCUMENT_UPLOADED = "document.uploaded"
    DOCUMENT_VALIDATED = "document.validated"
    DOCUMENT_SCAN_FAILED = "document.scan_failed"
    DOCUMENT_VERIFIED = "document.verified"
    DOCUMENT_REJECTED = "document.rejected"

    # Lender Applications
    LENDER_APPLICATION_SUBMITTED = "lender_application.submitted"
    LENDER_APPLICATION_SANCTIONED = "lender_application.sanctioned"
    LENDER_APPLICATION_DISBURSED = "lender_application.disbursed"
    WINNING_APPLICATION_SET = "lender_application.winning_set"

    # Payout
    PAYOUT_EXPECTATION_CREATED = "payout.expectation_created"
    PAYOUT_RECEIPT_MATCHED = "payout.receipt_matched"
    PAYOUT_CLAWBACK_RECORDED = "payout.clawback_recorded"
