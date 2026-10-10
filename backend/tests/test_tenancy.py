"""
DSA OS — Tenancy, White-Label & Organization Endpoints Tests
"""

import uuid
from types import SimpleNamespace
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import create_app
from app.modules.auth.dependencies import get_current_user
from app.modules.tenancy.models import Organization


@pytest.mark.asyncio
class TestTenancyEndpoints:
    """Tests for /api/v1/organizations and branding endpoints."""

    async def test_get_current_organization(self) -> None:
        app = create_app()
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        mock_user = SimpleNamespace(
            id=user_id,
            org_id=org_id,
            role="owner",
            is_active=True,
        )
        app.dependency_overrides[get_current_user] = lambda: mock_user

        mock_org = Organization(
            id=org_id,
            name="Apex Capital Advisors",
            slug="apex-loans",
            plan="growth",
            region="in-west-1",
            settings={
                "branding": {
                    "name": "Apex Capital Advisors",
                    "tagline": "Commercial Lending",
                    "logo_url": "/jai_auto_logo.jpg",
                    "theme_preset": "navy_slate",
                }
            },
            is_active=True,
        )

        class MockSession:
            async def get(self, model, ident):
                if model is Organization and ident == org_id:
                    return mock_org
                return None

            async def execute(self, *args, **kwargs):
                pass

        app.dependency_overrides[get_db] = lambda: MockSession()

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/organizations/current")
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["name"] == "Apex Capital Advisors"
            assert data["slug"] == "apex-loans"
            assert data["settings"]["branding"]["theme_preset"] == "navy_slate"

    async def test_update_branding(self) -> None:
        app = create_app()
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        mock_user = SimpleNamespace(
            id=user_id,
            org_id=org_id,
            role="owner",
            is_active=True,
        )
        app.dependency_overrides[get_current_user] = lambda: mock_user

        mock_org = Organization(
            id=org_id,
            name="Apex Capital Advisors",
            slug="apex-loans",
            plan="growth",
            region="in-west-1",
            settings={
                "branding": {
                    "name": "Apex Capital Advisors",
                    "tagline": "Commercial Lending",
                }
            },
            is_active=True,
        )

        class MockSession:
            async def get(self, model, ident):
                return mock_org

            async def execute(self, *args, **kwargs):
                pass

            async def commit(self):
                pass

            async def refresh(self, obj):
                pass

            def add(self, obj):
                pass

        app.dependency_overrides[get_db] = lambda: MockSession()

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.patch(
                "/api/v1/organizations/current/branding",
                json={
                    "name": "Jai Automobiles",
                    "tagline": "Vehicle Finance Operations",
                    "theme_preset": "gold_emerald",
                    "primary_color": "#10b981",
                },
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["settings"]["branding"]["name"] == "Jai Automobiles"
            assert data["settings"]["branding"]["theme_preset"] == "gold_emerald"
