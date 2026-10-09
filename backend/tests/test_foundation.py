"""
DSA OS — Foundation Unit & Integration Tests

Tests pagination, event bus, domain exceptions, models, workers, and error handlers.
"""

import uuid
from datetime import UTC, datetime

import pytest
from app.main import create_app
from app.modules.tenancy.models import Organization
from app.shared.events import DomainEvent, EventBus, EventTypes
from app.shared.exceptions import (
    AuthenticationError,
    BusinessRuleViolationError,
    ConflictError,
    DsaOsError,
    NotFoundError,
    PermissionDeniedError,
    StateTransitionError,
    ValidationError,
)
from app.shared.models import SoftDeleteMixin
from app.shared.pagination import (
    build_cursor_meta,
    build_pagination_meta,
    compute_offset,
    decode_cursor,
    encode_cursor,
    validate_page_params,
)
from app.workers.tasks import WorkerSettings, health_check_task
from httpx import ASGITransport, AsyncClient

# =============================================================================
# Pagination Tests
# =============================================================================


class TestPagination:
    """Tests for pagination utilities."""

    def test_validate_page_params_clamps(self) -> None:
        # Negative / zero page should clamp to 1
        page, page_size = validate_page_params(0, 25)
        assert page == 1
        assert page_size == 25

        page, page_size = validate_page_params(-5, 0)
        assert page == 1
        assert page_size == 1

        # Page size exceeding 100 should clamp to 100
        page, page_size = validate_page_params(2, 200)
        assert page == 2
        assert page_size == 100

    def test_compute_offset(self) -> None:
        assert compute_offset(1, 20) == 0
        assert compute_offset(2, 20) == 20
        assert compute_offset(5, 10) == 40

    def test_build_pagination_meta(self) -> None:
        meta = build_pagination_meta(total=100, page=1, page_size=20)
        assert meta.total == 100
        assert meta.page == 1
        assert meta.page_size == 20
        assert meta.has_next is True
        assert meta.has_prev is False

        meta_last = build_pagination_meta(total=100, page=5, page_size=20)
        assert meta_last.has_next is False
        assert meta_last.has_prev is True

    def test_cursor_round_trip(self) -> None:
        rec_id = uuid.uuid4()
        now = datetime.now(UTC)
        encoded = encode_cursor(rec_id, now)
        decoded = decode_cursor(encoded)

        assert decoded["id"] == str(rec_id)
        assert decoded["created_at"] == now.isoformat()

    def test_decode_cursor_invalid(self) -> None:
        with pytest.raises(ValueError, match="Invalid pagination cursor"):
            decode_cursor("not-valid-base64!!!")

        # Valid base64 but missing required keys
        import base64
        import json

        bad_payload = base64.urlsafe_b64encode(json.dumps({"wrong": "data"}).encode()).decode()
        with pytest.raises(ValueError, match="Invalid pagination cursor"):
            decode_cursor(bad_payload)

    def test_build_cursor_meta(self) -> None:
        meta = build_cursor_meta(
            items=[{"id": 1}],
            page_size=10,
            next_cursor="cursor_abc",
            prev_cursor=None,
        )
        assert meta.next_cursor == "cursor_abc"
        assert meta.has_next is True
        assert meta.has_prev is False


# =============================================================================
# Event Bus Tests
# =============================================================================


class TestEventBus:
    """Tests for the synchronous/async-ready domain event bus."""

    @pytest.mark.asyncio
    async def test_emit_and_subscribe(self) -> None:
        bus = EventBus()
        received: list[DomainEvent] = []

        @bus.on(EventTypes.CASE_CREATED)
        async def handle_case(event: DomainEvent) -> None:
            received.append(event)

        event = DomainEvent(
            event_type=EventTypes.CASE_CREATED,
            org_id="org-123",
            actor_id="user-456",
            payload={"case_id": "case-789"},
        )
        await bus.emit(event)

        assert len(received) == 1
        assert received[0].event_type == EventTypes.CASE_CREATED
        assert received[0].payload["case_id"] == "case-789"

    @pytest.mark.asyncio
    async def test_emit_no_handlers(self) -> None:
        bus = EventBus()
        # Should not raise
        await bus.emit(
            DomainEvent(
                event_type="unhandled.event",
                org_id="org-1",
                actor_id=None,
            )
        )

    @pytest.mark.asyncio
    async def test_emit_handler_failure_does_not_raise(self) -> None:
        bus = EventBus()

        @bus.on("failing.event")
        async def fail_handler(event: DomainEvent) -> None:
            raise RuntimeError("Handler failed intentionally")

        # Emit must not raise even if handler throws
        await bus.emit(
            DomainEvent(
                event_type="failing.event",
                org_id="org-1",
                actor_id=None,
            )
        )

    def test_clear_handlers(self) -> None:
        bus = EventBus()

        @bus.on("test.event")
        async def dummy(event: DomainEvent) -> None:
            pass

        assert len(bus._handlers["test.event"]) == 1
        bus.clear()
        assert len(bus._handlers) == 0


# =============================================================================
# Domain Exception Tests
# =============================================================================


class TestExceptions:
    """Tests for domain exceptions hierarchy and error structures."""

    def test_dsaos_error_defaults(self) -> None:
        err = DsaOsError("Base error", details={"key": "val"})
        assert err.message == "Base error"
        assert err.code == "DsaOsError"
        assert err.details == {"key": "val"}

    def test_not_found_error(self) -> None:
        err = NotFoundError("Case", "case-123")
        assert "case-123" in err.message
        assert err.code == "NOT_FOUND"
        assert err.details["resource"] == "Case"
        assert err.details["id"] == "case-123"

    def test_conflict_error(self) -> None:
        err = ConflictError("Resource already exists")
        assert err.code == "ConflictError"

    def test_validation_error(self) -> None:
        err = ValidationError("Field missing", details={"field": "pan"})
        assert err.code == "ValidationError"
        assert err.details["field"] == "pan"

    def test_permission_denied_error(self) -> None:
        err = PermissionDeniedError("Not allowed")
        assert err.code == "PermissionDeniedError"

    def test_business_rule_violation_error(self) -> None:
        err = BusinessRuleViolationError("Max loan exceeded")
        assert err.code == "BusinessRuleViolationError"

    def test_state_transition_error(self) -> None:
        err = StateTransitionError("Case", "lead", "disbursed")
        assert err.code == "INVALID_STATE_TRANSITION"
        assert "lead" in err.message
        assert "disbursed" in err.message


# =============================================================================
# Model & Worker Tests
# =============================================================================


class TestModelsAndWorkers:
    """Tests for database models and background workers."""

    def test_organization_model_repr(self) -> None:
        org_id = uuid.uuid4()
        org = Organization(
            id=org_id,
            name="Apex Loans",
            slug="apex-loans",
            plan="growth",
        )
        assert "apex-loans" in repr(org)
        assert "Apex Loans" in repr(org)

    def test_soft_delete_mixin(self) -> None:
        class FakeRecord(SoftDeleteMixin):
            pass

        rec = FakeRecord()
        rec.deleted_at = None
        assert rec.is_deleted is False
        rec.deleted_at = datetime.now(UTC)
        assert rec.is_deleted is True

    @pytest.mark.asyncio
    async def test_worker_health_check_task(self) -> None:
        result = await health_check_task({})
        assert result == "ok"
        assert WorkerSettings.max_jobs == 10
        assert health_check_task in WorkerSettings.functions


# =============================================================================
# Error Handler Integration Tests
# =============================================================================


@pytest.mark.asyncio
class TestErrorHandlers:
    """Tests that domain exceptions return the standardized envelope."""

    async def test_domain_exception_handling(self) -> None:
        app = create_app()

        # Add temporary test routes that raise domain exceptions
        @app.get("/test/not-found")
        async def raise_not_found() -> None:
            raise NotFoundError("Application", "app-999")

        @app.get("/test/forbidden")
        async def raise_forbidden() -> None:
            raise PermissionDeniedError("Access to tenant denied")

        @app.get("/test/unauthorized")
        async def raise_unauthorized() -> None:
            raise AuthenticationError("Token expired")

        @app.get("/test/conflict")
        async def raise_conflict() -> None:
            raise ConflictError("Duplicate application reference")

        @app.get("/test/validation")
        async def raise_validation() -> None:
            raise ValidationError("Invalid input", details={"field": "amount"})

        @app.get("/test/business-rule")
        async def raise_business_rule() -> None:
            raise BusinessRuleViolationError("Lender policy rejected")

        @app.get("/test/state-transition")
        async def raise_state_transition() -> None:
            raise StateTransitionError("Case", "lead", "disbursed")

        @app.get("/test/dsaos-error")
        async def raise_dsaos_error() -> None:
            raise DsaOsError("Direct domain error")

        @app.get("/test/unhandled")
        async def raise_unhandled() -> None:
            raise ValueError("Something unexpected")

        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://testserver",
        ) as client:
            # 404
            res = await client.get("/test/not-found")
            assert res.status_code == 404
            assert res.json()["error"]["code"] == "NOT_FOUND"

            # 403
            res = await client.get("/test/forbidden")
            assert res.status_code == 403

            # 401
            res = await client.get("/test/unauthorized")
            assert res.status_code == 401

            # 409
            res = await client.get("/test/conflict")
            assert res.status_code == 409

            # 422 validation
            res = await client.get("/test/validation")
            assert res.status_code == 422
            assert res.json()["error"]["details"][0]["field"] == "amount"

            # 422 business rule
            res = await client.get("/test/business-rule")
            assert res.status_code == 422

            # 422 state transition
            res = await client.get("/test/state-transition")
            assert res.status_code == 422

            # 500 domain error catch-all
            res = await client.get("/test/dsaos-error")
            assert res.status_code == 500

            # 500 unhandled
            res = await client.get("/test/unhandled")
            assert res.status_code == 500
            assert res.json()["error"]["code"] == "INTERNAL_ERROR"
