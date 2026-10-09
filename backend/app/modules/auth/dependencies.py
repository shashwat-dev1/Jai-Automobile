"""
DSA OS — Authentication & Authorization Dependencies

FastAPI dependencies for:
- Bearer token extraction and RS256 JWT decoding
- Immediate revocation check via auth_version (fail-closed)
- Tenant context binding
- RBAC permission enforcement
"""

import uuid
from collections.abc import Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.models import User
from app.modules.auth.permissions import has_permission
from app.modules.auth.security import decode_access_token
from app.modules.auth.service import AuthService
from app.modules.tenancy.context import (
    set_current_org_id,
    set_current_user_id,
    set_current_user_role,
)
from app.modules.tenancy.rls import set_session_tenant_context
from app.shared.exceptions import AuthenticationError, PermissionDeniedError

security_scheme = HTTPBearer(auto_error=False)


async def get_auth_service(
    request: Request, session: AsyncSession = Depends(get_db)
) -> AuthService:
    redis_client = getattr(request.app.state, "redis", None)
    return AuthService(session=session, redis_client=redis_client)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    session: AsyncSession = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
) -> User:
    """
    Authenticate the current request using an RS256 Bearer JWT.
    Enforces immediate session revocation via auth_version.
    Activates tenant context on both contextvars and PostgreSQL RLS.
    """
    if not credentials or not credentials.credentials:
        raise AuthenticationError("Authorization header missing or invalid", code="UNAUTHORIZED")

    # 1. Decode and verify RS256 JWT signature & expiration
    payload = decode_access_token(credentials.credentials)

    user_id_str = payload.get("sub")
    org_id_str = payload.get("org_id")
    role = payload.get("role")
    auth_version = payload.get("auth_version")

    if not user_id_str or not org_id_str or auth_version is None:
        raise AuthenticationError("Malformed token claims", code="INVALID_TOKEN")

    user_id = uuid.UUID(user_id_str)
    org_id = uuid.UUID(org_id_str)

    # 2. Set tenant context on DB session (activates PostgreSQL RLS before any DB queries)
    await set_session_tenant_context(session, org_id)

    # 3. Verify auth_version against Redis/DB (fail-closed)
    is_valid_version = await auth_service.verify_user_auth_version(user_id, auth_version)
    if not is_valid_version:
        raise AuthenticationError(
            "Session has been invalidated due to role change, password reset, or deactivation. Please log in again.",
            code="SESSION_REVOKED",
        )

    # 4. Fetch user entity
    stmt = select(User).where(User.id == user_id, User.org_id == org_id, User.deleted_at.is_(None))
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise AuthenticationError("User is deactivated or not found", code="USER_INACTIVE")

    # 5. Set request contextvars for tenancy
    set_current_org_id(org_id)
    set_current_user_id(user_id)
    set_current_user_role(role)

    return user


def require_permission(permission: str) -> Callable[[User], User]:
    """
    Dependency factory to enforce a specific RBAC capability.
    Raises 403 PermissionDeniedError if the user's role lacks the permission.
    """

    def dependency(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user.role, permission):
            raise PermissionDeniedError(
                f"Role '{user.role}' lacks permission '{permission}' to perform this action.",
                details={"required_permission": permission, "role": user.role},
            )
        return user

    return dependency


def require_role(*roles: str) -> Callable[[User], User]:
    """
    Dependency factory to restrict access to specific roles.
    """

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise PermissionDeniedError(
                f"Role '{user.role}' is not authorized to access this resource.",
                details={"allowed_roles": list(roles), "current_role": user.role},
            )
        return user

    return dependency
