"""
DSA OS — Authentication Domain Service

Handles authentication, token rotation, account lockouts, immediate session revocation,
and user management.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.schemas import TokenResponse
from app.modules.auth.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.modules.tenancy.models import Organization
from app.modules.tenancy.rls import set_session_tenant_context
from app.shared.exceptions import (
    AuthenticationError,
    BusinessRuleViolationError,
    ConflictError,
    NotFoundError,
)

logger = logging.getLogger(__name__)


class AuthService:
    """Core authentication, session, and user management operations."""

    def __init__(self, session: AsyncSession, redis_client: Any = None):
        self.session = session
        self.redis = redis_client
        self.settings = get_settings()

    # -------------------------------------------------------------------------
    # Authentication & Login
    # -------------------------------------------------------------------------

    async def authenticate(
        self,
        org_slug: str,
        identifier: str,
        password: str,
    ) -> User:
        """
        Authenticate user credentials against organization.
        Enforces account lockout (5 attempts / 15 minutes) and active status.
        """
        # 1. Resolve organization
        org_stmt = select(Organization).where(
            Organization.slug == org_slug, Organization.is_active.is_(True)
        )
        org_result = await self.session.execute(org_stmt)
        org = org_result.scalar_one_or_none()
        if not org:
            logger.warning("Auth failed: organization slug '%s' not found or inactive", org_slug)
            raise AuthenticationError(
                "Invalid organization or credentials", code="INVALID_CREDENTIALS"
            )

        # 2. Set tenant context for DB session so RLS activates
        await set_session_tenant_context(self.session, org.id)

        # 3. Lookup user by email or mobile within org
        user_stmt = select(User).where(
            User.org_id == org.id,
            (User.email == identifier) | (User.mobile == identifier),
            User.deleted_at.is_(None),
        )
        user_result = await self.session.execute(user_stmt)
        user = user_result.scalar_one_or_none()

        if not user:
            logger.warning("Auth failed: user '%s' not found in org '%s'", identifier, org_slug)
            raise AuthenticationError(
                "Invalid organization or credentials", code="INVALID_CREDENTIALS"
            )

        now = datetime.now(UTC)

        # 4. Check account lockout
        if user.is_locked:
            logger.warning(
                "Auth rejected: user '%s' is locked until %s", user.id, user.locked_until
            )
            raise AuthenticationError(
                "Account is temporarily locked due to multiple failed login attempts. Please try again later.",
                code="ACCOUNT_LOCKED",
                details={
                    "locked_until": user.locked_until.isoformat() if user.locked_until else None
                },
            )

        # If previous lock expired, reset
        if user.locked_until and now >= user.locked_until:
            user.locked_until = None
            user.failed_login_attempts = 0

        # 5. Check active status
        if not user.is_active:
            logger.warning("Auth rejected: user '%s' is deactivated", user.id)
            raise AuthenticationError(
                "Account has been deactivated. Contact your administrator.", code="USER_INACTIVE"
            )

        # 6. Verify password
        if not verify_password(password, user.password_hash):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= self.settings.auth_max_failed_logins:
                user.locked_until = now + timedelta(minutes=self.settings.auth_lockout_minutes)
                logger.warning(
                    "User '%s' locked out after %d failed attempts until %s",
                    user.id,
                    user.failed_login_attempts,
                    user.locked_until,
                )
            await self.session.commit()
            raise AuthenticationError(
                "Invalid organization or credentials", code="INVALID_CREDENTIALS"
            )

        # 7. Successful login
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = now
        await self.session.commit()

        return user

    # -------------------------------------------------------------------------
    # Token Issuance & Refresh
    # -------------------------------------------------------------------------

    async def issue_tokens(
        self,
        user: User,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> TokenResponse:
        """Issue an RS256 access token and a hashed single-use refresh token."""
        # Set tenant context for DB session so RLS allows inserting refresh_tokens
        await set_session_tenant_context(self.session, user.org_id)

        access_token = create_access_token(
            user_id=str(user.id),
            org_id=str(user.org_id),
            role=user.role,
            auth_version=user.auth_version,
        )

        raw_refresh, token_hash = generate_refresh_token(str(user.org_id))
        refresh_expires = datetime.now(UTC) + timedelta(
            days=self.settings.jwt_refresh_token_expire_days
        )

        refresh_record = RefreshToken(
            org_id=user.org_id,
            user_id=user.id,
            token_hash=token_hash,
            expires_at=refresh_expires,
            user_agent=user_agent[:500] if user_agent else None,
            ip_address=ip_address[:45] if ip_address else None,
        )
        self.session.add(refresh_record)
        await self.session.commit()

        # Cache auth_version in Redis if available
        if self.redis:
            try:
                await self.redis.set(f"user:{user.id}:auth_version", str(user.auth_version), ex=30)
            except Exception:
                logger.warning("Failed to cache auth_version in Redis for user %s", user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
            token_type="bearer",
            expires_in=self.settings.jwt_access_token_expire_minutes * 60,
        )

    async def rotate_refresh_token(
        self,
        raw_refresh_token: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> TokenResponse:
        """Rotate a refresh token: revokes old token and issues a fresh pair."""
        if "." in raw_refresh_token:
            org_id_part, _ = raw_refresh_token.split(".", 1)
            try:
                await set_session_tenant_context(self.session, org_id_part)
            except Exception:
                pass

        token_hash = hash_refresh_token(raw_refresh_token)

        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()

        if not record or not record.is_valid:
            logger.warning("Invalid or expired refresh token presented")
            raise AuthenticationError(
                "Invalid or expired refresh token", code="INVALID_REFRESH_TOKEN"
            )

        # Set tenant context to access the user
        await set_session_tenant_context(self.session, record.org_id)

        user_stmt = select(User).where(User.id == record.user_id, User.deleted_at.is_(None))
        user_result = await self.session.execute(user_stmt)
        user = user_result.scalar_one_or_none()

        if not user or not user.is_active:
            # Revoke token on inactive/deleted user
            record.revoke()
            await self.session.commit()
            raise AuthenticationError("User is no longer active", code="USER_INACTIVE")

        # Invalidate old refresh token (single-use rotation)
        record.revoke()

        # Issue new token pair
        return await self.issue_tokens(user, user_agent, ip_address)

    async def logout(self, raw_refresh_token: str) -> None:
        """Revoke a refresh token on logout."""
        if "." in raw_refresh_token:
            org_id_part, _ = raw_refresh_token.split(".", 1)
            try:
                await set_session_tenant_context(self.session, org_id_part)
            except Exception:
                pass

        token_hash = hash_refresh_token(raw_refresh_token)
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        result = await self.session.execute(stmt)
        record = result.scalar_one_or_none()
        if record:
            record.revoke()
            await self.session.commit()

    # -------------------------------------------------------------------------
    # Immediate Revocation & auth_version verification
    # -------------------------------------------------------------------------

    async def verify_user_auth_version(
        self, user_id: uuid.UUID | str, expected_version: int
    ) -> bool:
        """
        Verify that the token's auth_version matches the current server state.
        Checks Redis cache first (30s TTL). Falls back to database. Fail-closed.
        """
        user_id_str = str(user_id)
        cache_key = f"user:{user_id_str}:auth_version"

        if self.redis:
            try:
                cached_val = await self.redis.get(cache_key)
                if cached_val is not None:
                    return int(cached_val) == expected_version
            except Exception:
                logger.warning("Redis lookup failed for %s, falling back to DB", cache_key)

        # Database lookup
        stmt = select(User.auth_version, User.is_active).where(
            User.id == uuid.UUID(user_id_str), User.deleted_at.is_(None)
        )
        result = await self.session.execute(stmt)
        row = result.first()

        if not row:
            return False

        current_version, is_active = row
        if not is_active:
            return False

        # Update Redis cache
        if self.redis:
            try:
                await self.redis.set(cache_key, str(current_version), ex=30)
            except Exception:
                logger.debug("Failed to set redis cache for %s", cache_key)

        return bool(current_version == expected_version)

    async def invalidate_user_sessions(self, user_id: uuid.UUID) -> int:
        """
        Increment auth_version and revoke all refresh tokens.
        Renders ALL existing access tokens immediately invalid.
        """
        stmt = select(User).where(User.id == user_id)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("User", str(user_id))

        new_version = user.increment_auth_version()

        # Revoke all active refresh tokens for this user
        now = datetime.now(UTC)
        tokens_stmt = select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
        tokens_res = await self.session.execute(tokens_stmt)
        for token in tokens_res.scalars():
            token.revoked_at = now

        await self.session.commit()

        # Invalidate Redis cache
        if self.redis:
            try:
                await self.redis.delete(f"user:{user_id}:auth_version")
            except Exception:
                logger.warning("Failed to invalidate Redis auth_version cache for user %s", user_id)

        logger.info(
            "Invalidated all sessions for user %s (new auth_version=%d)", user_id, new_version
        )
        return new_version

    # -------------------------------------------------------------------------
    # User Management (Owner)
    # -------------------------------------------------------------------------

    async def create_user(
        self,
        org_id: uuid.UUID,
        name: str,
        role: str,
        password: str,
        email: str | None = None,
        mobile: str | None = None,
    ) -> User:
        """Create a new user within the specified organization."""
        if not email and not mobile:
            raise BusinessRuleViolationError(
                "At least one contact method (email or mobile) must be provided."
            )

        await set_session_tenant_context(self.session, org_id)

        # Check unique email/mobile within org
        if email:
            existing = await self.session.execute(
                select(User).where(
                    User.org_id == org_id, User.email == email, User.deleted_at.is_(None)
                )
            )
            if existing.scalar_one_or_none():
                raise ConflictError(
                    f"User with email '{email}' already exists in this organization."
                )

        if mobile:
            existing_mob = await self.session.execute(
                select(User).where(
                    User.org_id == org_id, User.mobile == mobile, User.deleted_at.is_(None)
                )
            )
            if existing_mob.scalar_one_or_none():
                raise ConflictError(
                    f"User with mobile '{mobile}' already exists in this organization."
                )

        new_user = User(
            org_id=org_id,
            name=name,
            role=role,
            email=email,
            mobile=mobile,
            password_hash=hash_password(password),
            auth_version=1,
            is_active=True,
        )
        self.session.add(new_user)
        await self.session.commit()
        await self.session.refresh(new_user)
        return new_user

    async def update_user(
        self,
        org_id: uuid.UUID,
        actor_id: uuid.UUID,
        target_user_id: uuid.UUID,
        name: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> User:
        """Update user profile, role, or active status."""
        await set_session_tenant_context(self.session, org_id)

        stmt = select(User).where(
            User.id == target_user_id, User.org_id == org_id, User.deleted_at.is_(None)
        )
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError("User", str(target_user_id))

        if is_active is False and actor_id == target_user_id:
            raise BusinessRuleViolationError("Cannot deactivate your own account.")

        role_changed = False
        if role is not None and role != user.role:
            user.role = role
            role_changed = True

        deactivated = False
        if is_active is not None and is_active != user.is_active:
            user.is_active = is_active
            if not is_active:
                deactivated = True

        if name is not None:
            user.name = name

        # Any role change or deactivation MUST increment auth_version
        if role_changed or deactivated:
            user.increment_auth_version()
            # Revoke refresh tokens
            now = datetime.now(UTC)
            tokens_stmt = select(RefreshToken).where(
                RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
            )
            tokens_res = await self.session.execute(tokens_stmt)
            for t in tokens_res.scalars():
                t.revoked_at = now

            if self.redis:
                try:
                    await self.redis.delete(f"user:{user.id}:auth_version")
                except Exception:
                    logger.debug("Failed to delete redis cache for user %s", user.id)

        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def list_users(self, org_id: uuid.UUID) -> list[User]:
        """List all users in the organization."""
        await set_session_tenant_context(self.session, org_id)
        stmt = (
            select(User)
            .where(User.org_id == org_id, User.deleted_at.is_(None))
            .order_by(User.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
