"""
DSA OS — Role-Based Access Control (RBAC) Tests

Verifies permission matrix per SRS Appendix B:
- All 6 roles: owner, manager, processor, field_executive, accountant, auditor
- Negative tests for privilege escalation
- Endpoint level permission checks returning 403
"""

import uuid

import pytest
from app.main import create_app
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.permissions import (
    PERM_AUDIT_READ,
    PERM_CASES_CREATE,
    PERM_CASES_READ,
    PERM_CASES_UPDATE,
    PERM_DATA_EXPORT,
    PERM_DOCS_ARCHIVE,
    PERM_DOCS_READ,
    PERM_DOCS_UPLOAD,
    PERM_PAYOUT_READ,
    PERM_PAYOUT_UPDATE,
    PERM_RECON_READ,
    PERM_RECON_UPDATE,
    PERM_USERS_MANAGE,
    has_permission,
)
from httpx import ASGITransport, AsyncClient


class TestRolePermissionMatrix:
    """Matrix tests verifying SRS Appendix B capabilities."""

    def test_owner_has_all_permissions(self) -> None:
        """Owner role possesses all permissions."""
        assert has_permission("owner", PERM_USERS_MANAGE) is True
        assert has_permission("owner", PERM_AUDIT_READ) is True
        assert has_permission("owner", PERM_PAYOUT_UPDATE) is True
        assert has_permission("owner", PERM_CASES_CREATE) is True

    def test_processor_cannot_manage_users_or_payouts(self) -> None:
        """Processor can handle cases and docs, but cannot manage users or payout rules."""
        assert has_permission("processor", PERM_CASES_CREATE) is True
        assert has_permission("processor", PERM_CASES_UPDATE) is True
        assert has_permission("processor", PERM_DOCS_UPLOAD) is True
        assert has_permission("processor", PERM_DOCS_READ) is True

        # Negative checks
        assert has_permission("processor", PERM_USERS_MANAGE) is False
        assert has_permission("processor", PERM_PAYOUT_READ) is False
        assert has_permission("processor", PERM_PAYOUT_UPDATE) is False
        assert has_permission("processor", PERM_AUDIT_READ) is False
        assert has_permission("processor", PERM_DOCS_ARCHIVE) is False

    def test_field_executive_restricted_permissions(self) -> None:
        """Field executive cannot access financial operations or manage users."""
        assert has_permission("field_executive", PERM_CASES_CREATE) is True
        assert has_permission("field_executive", PERM_DOCS_UPLOAD) is True

        # Negative checks
        assert has_permission("field_executive", PERM_PAYOUT_READ) is False
        assert has_permission("field_executive", PERM_PAYOUT_UPDATE) is False
        assert has_permission("field_executive", PERM_RECON_READ) is False
        assert has_permission("field_executive", PERM_USERS_MANAGE) is False
        assert has_permission("field_executive", PERM_AUDIT_READ) is False

    def test_accountant_permissions(self) -> None:
        """Accountant has payout, recon, and export permissions, but cannot create cases or manage users."""
        assert has_permission("accountant", PERM_PAYOUT_READ) is True
        assert has_permission("accountant", PERM_PAYOUT_UPDATE) is True
        assert has_permission("accountant", PERM_RECON_READ) is True
        assert has_permission("accountant", PERM_RECON_UPDATE) is True
        assert has_permission("accountant", PERM_DATA_EXPORT) is True

        # Negative checks
        assert has_permission("accountant", PERM_CASES_CREATE) is False
        assert has_permission("accountant", PERM_CASES_UPDATE) is False
        assert has_permission("accountant", PERM_DOCS_UPLOAD) is False
        assert has_permission("accountant", PERM_USERS_MANAGE) is False

    def test_auditor_permissions(self) -> None:
        """Auditor has read-only access to audit, cases, and team, but cannot modify anything."""
        assert has_permission("auditor", PERM_AUDIT_READ) is True
        assert has_permission("auditor", PERM_CASES_READ) is True
        assert has_permission("auditor", PERM_DOCS_READ) is True

        # Negative checks
        assert has_permission("auditor", PERM_CASES_CREATE) is False
        assert has_permission("auditor", PERM_CASES_UPDATE) is False
        assert has_permission("auditor", PERM_PAYOUT_UPDATE) is False
        assert has_permission("auditor", PERM_USERS_MANAGE) is False


@pytest.mark.asyncio
class TestEndpointRbacEnforcement:
    """Tests that API endpoints enforce permissions and return 403 on denial."""

    async def test_non_owner_accessing_users_endpoint_returns_403(self) -> None:
        app = create_app()

        class MockProcessor:
            id = uuid.uuid4()
            org_id = uuid.uuid4()
            role = "processor"
            is_active = True

        app.dependency_overrides[get_current_user] = lambda: MockProcessor()

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get("/api/v1/users")
            assert res.status_code == 403
            assert res.json()["error"]["code"] == "PermissionDeniedError"

        app.dependency_overrides.clear()

    async def test_non_auditor_accessing_audit_endpoint_returns_403(self) -> None:
        app = create_app()

        class MockFieldExec:
            id = uuid.uuid4()
            org_id = uuid.uuid4()
            role = "field_executive"
            is_active = True

        app.dependency_overrides[get_current_user] = lambda: MockFieldExec()

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get("/api/v1/audit")
            assert res.status_code == 403
            assert res.json()["error"]["code"] == "PermissionDeniedError"

        app.dependency_overrides.clear()
