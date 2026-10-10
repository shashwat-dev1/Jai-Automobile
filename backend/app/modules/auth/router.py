"""
DSA OS — Authentication & User Management Endpoints
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.audit.service import AuditService
from app.modules.auth.dependencies import (
    get_auth_service,
    get_current_user,
    require_permission,
)
from app.modules.auth.models import User
from app.modules.auth.permissions import PERM_USERS_MANAGE, ROLE_PERMISSIONS
from app.modules.auth.schemas import (
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserCreateRequest,
    UserResponse,
    UserUpdateRequest,
)
from app.modules.auth.service import AuthService
from app.shared.schemas import ApiResponse

router = APIRouter(prefix="", tags=["Authentication"])


# -----------------------------------------------------------------------------
# Auth Endpoints (Public)
# -----------------------------------------------------------------------------


@router.post("/auth/login", response_model=ApiResponse[TokenResponse])
async def login(
    payload: LoginRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> ApiResponse[TokenResponse]:
    """Authenticate with org_slug, identifier (email/mobile), and password."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    user = await auth_service.authenticate(
        org_slug=payload.org_slug,
        identifier=payload.identifier,
        password=payload.password,
    )

    tokens = await auth_service.issue_tokens(
        user=user,
        user_agent=user_agent,
        ip_address=client_ip,
    )
    tokens.user = UserResponse.model_validate(user)

    # Log audit event
    audit = AuditService(session=auth_service.session)
    await audit.log_event(
        org_id=user.org_id,
        actor_id=user.id,
        actor_role=user.role,
        action="auth.user_login",
        entity_type="user",
        entity_id=str(user.id),
        ip_address=client_ip,
        user_agent=user_agent,
    )

    return ApiResponse(data=tokens)


@router.post("/auth/refresh", response_model=ApiResponse[TokenResponse])
async def refresh_token(
    payload: RefreshTokenRequest,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> ApiResponse[TokenResponse]:
    """Rotate an active refresh token to obtain a fresh token pair."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    new_tokens = await auth_service.rotate_refresh_token(
        raw_refresh_token=payload.refresh_token,
        user_agent=user_agent,
        ip_address=client_ip,
    )
    return ApiResponse(data=new_tokens)


@router.post("/auth/logout", status_code=status.HTTP_200_OK)
async def logout(
    payload: RefreshTokenRequest,
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> ApiResponse[dict[str, str]]:
    """Revoke an active refresh token session."""
    await auth_service.logout(payload.refresh_token)

    audit = AuditService(session=auth_service.session)
    await audit.log_event(
        org_id=current_user.org_id,
        actor_id=current_user.id,
        actor_role=current_user.role,
        action="auth.user_logout",
        entity_type="user",
        entity_id=str(current_user.id),
    )
    return ApiResponse(data={"message": "Logged out successfully"})


@router.get("/auth/me", response_model=ApiResponse[dict[str, Any]])
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[dict[str, Any]]:
    """Return profile, permissions, and organization branding for the currently authenticated user."""
    perms = list(ROLE_PERMISSIONS.get(current_user.role, set()))
    user_data = UserResponse.model_validate(current_user).model_dump(mode="json")
    user_data["permissions"] = sorted(perms)
    try:
        from app.modules.tenancy.models import Organization
        org = await db.get(Organization, current_user.org_id)
        if org:
            user_data["organization"] = {
                "id": str(org.id),
                "name": org.name,
                "slug": org.slug,
                "plan": org.plan,
                "is_active": org.is_active,
                "settings": org.settings or {},
            }
    except Exception:
        pass
    return ApiResponse(data=user_data)


# -----------------------------------------------------------------------------
# User Management Endpoints (Owner only: PERM_USERS_MANAGE)
# -----------------------------------------------------------------------------


@router.get("/users", response_model=ApiResponse[list[UserResponse]])
async def list_users(
    current_user: User = Depends(require_permission(PERM_USERS_MANAGE)),
    auth_service: AuthService = Depends(get_auth_service),
) -> ApiResponse[list[UserResponse]]:
    """List all users within the current user's organization."""
    users = await auth_service.list_users(org_id=current_user.org_id)
    return ApiResponse(data=[UserResponse.model_validate(u) for u in users])


@router.post(
    "/users", response_model=ApiResponse[UserResponse], status_code=status.HTTP_201_CREATED
)
async def create_user(
    payload: UserCreateRequest,
    current_user: User = Depends(require_permission(PERM_USERS_MANAGE)),
    auth_service: AuthService = Depends(get_auth_service),
) -> ApiResponse[UserResponse]:
    """Create a new user within the organization."""
    new_user = await auth_service.create_user(
        org_id=current_user.org_id,
        name=payload.name,
        role=payload.role,
        password=payload.password,
        email=str(payload.email) if payload.email else None,
        mobile=payload.mobile,
    )

    audit = AuditService(session=auth_service.session)
    await audit.log_event(
        org_id=current_user.org_id,
        actor_id=current_user.id,
        actor_role=current_user.role,
        action="user.created",
        entity_type="user",
        entity_id=str(new_user.id),
        changes={"name": new_user.name, "role": new_user.role, "email": new_user.email},
    )

    return ApiResponse(data=UserResponse.model_validate(new_user))


@router.patch("/users/{user_id}", response_model=ApiResponse[UserResponse])
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    current_user: User = Depends(require_permission(PERM_USERS_MANAGE)),
    auth_service: AuthService = Depends(get_auth_service),
) -> ApiResponse[UserResponse]:
    """Update user role, name, or active status (deactivation immediately revokes sessions)."""
    updated_user = await auth_service.update_user(
        org_id=current_user.org_id,
        actor_id=current_user.id,
        target_user_id=user_id,
        name=payload.name,
        role=payload.role,
        is_active=payload.is_active,
    )

    audit = AuditService(session=auth_service.session)
    await audit.log_event(
        org_id=current_user.org_id,
        actor_id=current_user.id,
        actor_role=current_user.role,
        action="user.updated",
        entity_type="user",
        entity_id=str(updated_user.id),
        changes=payload.model_dump(exclude_unset=True),
    )

    return ApiResponse(data=UserResponse.model_validate(updated_user))
