"""
DSA OS — Tenancy, Organization & White-Label Router
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.audit.service import AuditService
from app.modules.auth.dependencies import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import PERM_USERS_MANAGE
from app.modules.auth.security import hash_password
from app.modules.tenancy.models import Organization
from app.modules.tenancy.schemas import (
    OrganizationCreateRequest,
    OrganizationResponse,
    OrganizationUpdateRequest,
    TenantBrandingUpdateRequest,
)
from app.shared.exceptions import ConflictError, NotFoundError
from app.shared.schemas import ApiResponse

router = APIRouter(tags=["Tenancy & Organizations"])


# -----------------------------------------------------------------------------
# Current Tenant Info & Branding (Accessible to Tenant Users / Owner)
# -----------------------------------------------------------------------------


@router.get(
    "/organizations/current",
    response_model=ApiResponse[OrganizationResponse],
    summary="Get current organization profile, branding, and enabled modules",
)
@router.get(
    "/tenancy/current",
    response_model=ApiResponse[OrganizationResponse],
    summary="Get current organization profile (alias)",
)
async def get_current_organization(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[OrganizationResponse]:
    org = await db.get(Organization, current_user.org_id)
    if not org:
        raise NotFoundError("Current organization not found")
    return ApiResponse(data=OrganizationResponse.model_validate(org))


@router.patch(
    "/organizations/current/branding",
    response_model=ApiResponse[OrganizationResponse],
    summary="Update current organization white-label branding and theme (Owner only)",
)
@router.patch(
    "/tenancy/current/branding",
    response_model=ApiResponse[OrganizationResponse],
    summary="Update current organization branding (alias)",
)
async def update_tenant_branding(
    payload: TenantBrandingUpdateRequest,
    current_user: Annotated[User, Depends(require_permission(PERM_USERS_MANAGE))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[OrganizationResponse]:
    org = await db.get(Organization, current_user.org_id)
    if not org:
        raise NotFoundError("Current organization not found")

    settings = dict(org.settings or {})
    branding = dict(settings.get("branding") or {})

    if payload.name is not None:
        branding["name"] = payload.name
    if payload.tagline is not None:
        branding["tagline"] = payload.tagline
    if payload.logo_url is not None:
        branding["logo_url"] = payload.logo_url
    if payload.theme_preset is not None:
        branding["theme_preset"] = payload.theme_preset
    if payload.primary_color is not None:
        branding["primary_color"] = payload.primary_color
    if payload.accent_color is not None:
        branding["accent_color"] = payload.accent_color

    settings["branding"] = branding
    org.settings = settings
    await db.commit()
    await db.refresh(org)

    audit = AuditService(session=db)
    await audit.log_event(
        org_id=org.id,
        actor_id=current_user.id,
        actor_role=current_user.role,
        action="tenant.branding_updated",
        entity_type="organization",
        entity_id=str(org.id),
        changes=branding,
    )

    return ApiResponse(data=OrganizationResponse.model_validate(org))


# -----------------------------------------------------------------------------
# Platform Administration (Multi-Organization Management)
# -----------------------------------------------------------------------------


@router.get(
    "/organizations",
    response_model=ApiResponse[list[OrganizationResponse]],
    summary="List all tenant organizations (Platform Admin / Owner)",
)
@router.get(
    "/platform/organizations",
    response_model=ApiResponse[list[OrganizationResponse]],
    summary="List all organizations (alias)",
)
async def list_organizations(
    current_user: Annotated[User, Depends(require_permission(PERM_USERS_MANAGE))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[list[OrganizationResponse]]:
    stmt = select(Organization).order_by(Organization.created_at.desc())
    res = await db.execute(stmt)
    orgs = res.scalars().all()
    return ApiResponse(data=[OrganizationResponse.model_validate(o) for o in orgs])


@router.post(
    "/organizations",
    response_model=ApiResponse[OrganizationResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Onboard a new tenant organization + initial Owner user",
)
@router.post(
    "/platform/organizations",
    response_model=ApiResponse[OrganizationResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Onboard new organization (alias)",
)
async def create_organization(
    payload: OrganizationCreateRequest,
    current_user: Annotated[User, Depends(require_permission(PERM_USERS_MANAGE))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[OrganizationResponse]:
    # Verify slug uniqueness
    existing = await db.execute(select(Organization).where(Organization.slug == payload.slug))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Organization slug '{payload.slug}' already exists")

    new_org = Organization(
        id=uuid.uuid4(),
        name=payload.name,
        slug=payload.slug,
        gstin=payload.gstin,
        pan=payload.pan,
        plan=payload.plan,
        settings=payload.settings or {
            "branding": {
                "name": payload.name,
                "tagline": "Vehicle Finance Operations",
                "logo_url": "/jai_auto_logo.jpg",
                "theme_preset": "gold_emerald",
            },
            "modules": {
                "cases": True,
                "documents": True,
                "lenders": True,
                "pdd": True,
                "payout": True,
                "reconciliation": True,
                "reports": True,
            },
        },
        is_active=True,
    )
    db.add(new_org)
    await db.flush()

    # Create initial Owner
    owner_user = User(
        id=uuid.uuid4(),
        org_id=new_org.id,
        name=payload.owner_name,
        email=str(payload.owner_email),
        mobile=payload.owner_mobile,
        role="owner",
        password_hash=hash_password(payload.owner_password),
        auth_version=1,
        is_active=True,
    )
    db.add(owner_user)
    await db.commit()
    await db.refresh(new_org)

    audit = AuditService(session=db)
    await audit.log_event(
        org_id=new_org.id,
        actor_id=current_user.id,
        actor_role=current_user.role,
        action="organization.created",
        entity_type="organization",
        entity_id=str(new_org.id),
        changes={"name": new_org.name, "slug": new_org.slug, "owner_email": owner_user.email},
    )

    return ApiResponse(data=OrganizationResponse.model_validate(new_org))


@router.patch(
    "/organizations/{org_id}",
    response_model=ApiResponse[OrganizationResponse],
    summary="Update organization status, plan, or settings",
)
@router.patch(
    "/platform/organizations/{org_id}",
    response_model=ApiResponse[OrganizationResponse],
    summary="Update organization status (alias)",
)
async def update_organization(
    org_id: uuid.UUID,
    payload: OrganizationUpdateRequest,
    current_user: Annotated[User, Depends(require_permission(PERM_USERS_MANAGE))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[OrganizationResponse]:
    org = await db.get(Organization, org_id)
    if not org:
        raise NotFoundError("Organization not found")

    if payload.name is not None:
        org.name = payload.name
    if payload.plan is not None:
        org.plan = payload.plan
    if payload.is_active is not None:
        org.is_active = payload.is_active
    if payload.settings is not None:
        org.settings = {**(org.settings or {}), **payload.settings}

    await db.commit()
    await db.refresh(org)

    audit = AuditService(session=db)
    await audit.log_event(
        org_id=org.id,
        actor_id=current_user.id,
        actor_role=current_user.role,
        action="organization.updated",
        entity_type="organization",
        entity_id=str(org.id),
        changes=payload.model_dump(exclude_unset=True),
    )

    return ApiResponse(data=OrganizationResponse.model_validate(org))
