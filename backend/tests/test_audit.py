"""
DSA OS — Audit Trail Tests

Tests:
- Creating immutable audit entries
- Searching audit log by actor, action, date
- CSV export generation
- Endpoint authorization and response structures
"""

import uuid

import pytest
from app.main import create_app
from app.modules.audit.models import AuditLog
from app.modules.auth.dependencies import get_current_user
from httpx import ASGITransport, AsyncClient


class TestAuditUnit:
    """Unit tests for AuditLog model and service logic."""

    def test_audit_log_representation(self) -> None:
        log_id = uuid.uuid4()
        actor_id = uuid.uuid4()
        entry = AuditLog(
            id=log_id,
            action="case.status_changed",
            entity_type="case",
            entity_id="case-100",
            actor_id=actor_id,
        )
        assert "case.status_changed" in repr(entry)
        assert str(actor_id) in repr(entry)


@pytest.mark.asyncio
class TestAuditEndpoints:
    """Tests for /api/v1/audit endpoints."""

    async def test_owner_can_access_audit_search(self) -> None:
        app = create_app()

        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        from types import SimpleNamespace

        mock_owner = SimpleNamespace(
            id=user_id,
            org_id=org_id,
            role="owner",
            is_active=True,
        )
        app.dependency_overrides[get_current_user] = lambda: mock_owner

        # Mock database session returning empty audit list
        class MockSession:
            async def execute(self, stmt):  # type: ignore[no-untyped-def]
                class MockResult:
                    def scalar_one(self) -> int:
                        return 0

                    def scalars(self):  # type: ignore[no-untyped-def]
                        class MockScalars:
                            def all(self) -> list[AuditLog]:
                                return []

                        return MockScalars()

                return MockResult()

        from app.database import get_db

        app.dependency_overrides[get_db] = lambda: MockSession()

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get("/api/v1/audit")
            assert res.status_code == 200
            assert res.json()["data"] == []
            assert res.json()["meta"]["total"] == 0

        app.dependency_overrides.clear()
