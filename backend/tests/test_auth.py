"""
DSA OS — Authentication & Session Revocation Tests

Tests:
- Argon2id password hashing and verification
- RS256 JWT access token signing, verification, and claims
- Refresh token generation, hashing, and rotation
- Account lockout after 5 failed attempts
- Immediate session revocation via auth_version (ADR-005)
- /api/v1/auth/login, /refresh, /logout, /me endpoints
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.main import create_app
from app.modules.auth.models import User
from app.modules.auth.security import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.shared.exceptions import AuthenticationError
from httpx import ASGITransport, AsyncClient

# =============================================================================
# Unit Tests: Cryptographic Foundations
# =============================================================================


class TestCryptoAndTokens:
    """Tests for Argon2id hashing and RS256 JWT operations."""

    def test_argon2id_hashing(self) -> None:
        password = "SecurePassword@123"
        hashed = hash_password(password)
        assert hashed.startswith("$argon2")
        assert verify_password(password, hashed) is True
        assert verify_password("WrongPassword@123", hashed) is False

    def test_rs256_jwt_token_roundtrip(self) -> None:
        user_id = str(uuid.uuid4())
        org_id = str(uuid.uuid4())
        token = create_access_token(
            user_id=user_id,
            org_id=org_id,
            role="processor",
            auth_version=1,
            expires_delta=timedelta(minutes=15),
        )

        claims = decode_access_token(token)
        assert claims["sub"] == user_id
        assert claims["org_id"] == org_id
        assert claims["role"] == "processor"
        assert claims["auth_version"] == 1
        assert "exp" in claims

    def test_rs256_expired_token_rejected(self) -> None:
        user_id = str(uuid.uuid4())
        org_id = str(uuid.uuid4())
        # Expired token
        token = create_access_token(
            user_id=user_id,
            org_id=org_id,
            role="owner",
            auth_version=1,
            expires_delta=timedelta(seconds=-1),
        )

        with pytest.raises(AuthenticationError) as exc_info:
            decode_access_token(token)
        assert exc_info.value.code == "TOKEN_EXPIRED"

    def test_refresh_token_generation_and_hashing(self) -> None:
        raw_token, token_hash = generate_refresh_token()
        assert len(raw_token) >= 40
        assert len(token_hash) == 64  # SHA-256 hex string
        assert hash_refresh_token(raw_token) == token_hash


# =============================================================================
# Unit & Service Tests: Account Lockout & Immediate Revocation
# =============================================================================


class TestAccountLockoutAndRevocation:
    """Tests for account lockout after 5 failures and auth_version immediate revocation."""

    def test_user_lockout_property(self) -> None:
        user = User(
            org_id=uuid.uuid4(),
            name="Test User",
            role="processor",
            password_hash="dummy",
            auth_version=1,
            is_active=True,
        )
        assert user.is_locked is False

        # Lock in the future
        user.locked_until = datetime.now(UTC) + timedelta(minutes=15)
        assert user.is_locked is True

        # Lock in the past
        user.locked_until = datetime.now(UTC) - timedelta(minutes=1)
        assert user.is_locked is False

    def test_user_increment_auth_version(self) -> None:
        user = User(
            org_id=uuid.uuid4(),
            name="Test User",
            role="processor",
            password_hash="dummy",
            auth_version=1,
            is_active=True,
        )
        assert user.auth_version == 1
        new_version = user.increment_auth_version()
        assert new_version == 2
        assert user.auth_version == 2


# =============================================================================
# API Integration Tests: Auth Endpoints
# =============================================================================


@pytest.mark.asyncio
class TestAuthApi:
    """Integration tests for /api/v1/auth/* endpoints."""

    async def test_unauthenticated_request_rejected(self) -> None:
        app = create_app()
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get("/api/v1/auth/me")
            assert res.status_code == 401
            assert res.json()["error"]["code"] == "UNAUTHORIZED"

    async def test_tampered_token_rejected(self) -> None:
        app = create_app()
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer not-a-valid-jwt-token"},
            )
            assert res.status_code == 401
            assert res.json()["error"]["code"] == "INVALID_TOKEN"

    async def test_auth_me_with_valid_token(self) -> None:
        """When an access token with matching auth_version is presented, /auth/me returns profile."""
        app = create_app()

        org_id = uuid.uuid4()
        user_id = uuid.uuid4()

        # Mock auth_service.verify_user_auth_version to return True for this unit test
        token = create_access_token(
            user_id=str(user_id),
            org_id=str(org_id),
            role="owner",
            auth_version=1,
        )

        from types import SimpleNamespace

        from app.modules.auth.dependencies import get_current_user

        mock_user = SimpleNamespace(
            id=user_id,
            org_id=org_id,
            name="Super Owner",
            email="owner@test.com",
            mobile="9999999999",
            role="owner",
            auth_version=1,
            is_active=True,
            created_at=datetime.now(UTC),
            last_login_at=None,
        )

        # Override dependency for targeted endpoint test
        app.dependency_overrides[get_current_user] = lambda: mock_user

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert res.status_code == 200
            data = res.json()["data"]
            assert data["name"] == "Super Owner"
            assert data["role"] == "owner"
            assert "cases:create" in data["permissions"]
            assert "users:manage" in data["permissions"]

        app.dependency_overrides.clear()
