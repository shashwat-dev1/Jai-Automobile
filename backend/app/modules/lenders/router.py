"""
DSA OS — Lender and Application API Endpoints
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import (
    PERM_CASES_READ,
    PERM_CASES_UPDATE,
    PERM_LENDERS_MANAGE,
    PERM_LENDERS_READ,
)
from app.modules.lenders.schemas import (
    LenderApplicationCreateRequest,
    LenderApplicationResponse,
    LenderApplicationUpdateRequest,
    LenderCreateRequest,
    LenderResponse,
    LenderUpdateRequest,
)
from app.modules.lenders.service import LenderApplicationService, LenderService
from app.shared.schemas import ApiResponse

router = APIRouter(tags=["lenders"])


# -----------------------------------------------------------------------------
# Configuration: Lenders Catalog
# -----------------------------------------------------------------------------


@router.get(
    "/config/lenders",
    response_model=ApiResponse[list[LenderResponse]],
    summary="List active lenders for the organization",
)
@router.get(
    "/lenders",
    response_model=ApiResponse[list[LenderResponse]],
    summary="List active lenders for the organization (alias)",
)
async def list_lenders(
    is_active: bool | None = Query(None, description="Filter by active status"),
    current_user: User = Depends(require_permission(PERM_LENDERS_READ)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[LenderResponse]]:
    service = LenderService(db)
    lenders = await service.list_lenders(org_id=current_user.org_id, is_active=is_active)
    return ApiResponse(data=lenders)


@router.post(
    "/config/lenders",
    response_model=ApiResponse[LenderResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new lender partner",
)
@router.post(
    "/lenders",
    response_model=ApiResponse[LenderResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new lender partner (alias)",
)
async def create_lender(
    payload: LenderCreateRequest,
    current_user: User = Depends(require_permission(PERM_LENDERS_MANAGE)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[LenderResponse]:
    service = LenderService(db)
    lender = await service.create_lender(
        org_id=current_user.org_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=lender)


@router.patch(
    "/config/lenders/{id}",
    response_model=ApiResponse[LenderResponse],
    summary="Update lender details or active status",
)
@router.patch(
    "/lenders/{id}",
    response_model=ApiResponse[LenderResponse],
    summary="Update lender details or active status (alias)",
)
async def update_lender(
    id: uuid.UUID,
    payload: LenderUpdateRequest,
    current_user: User = Depends(require_permission(PERM_LENDERS_MANAGE)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[LenderResponse]:
    service = LenderService(db)
    lender = await service.update_lender(
        org_id=current_user.org_id,
        lender_id=id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=lender)


# -----------------------------------------------------------------------------
# Case Lender Applications
# -----------------------------------------------------------------------------


@router.get(
    "/cases/{case_id}/applications",
    response_model=ApiResponse[list[LenderApplicationResponse]],
    summary="List lender applications for a case (multi-login comparison)",
)
async def list_case_applications(
    case_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[list[LenderApplicationResponse]]:
    service = LenderApplicationService(db)
    apps = await service.list_applications(org_id=current_user.org_id, case_id=case_id)
    return ApiResponse(data=apps)


@router.post(
    "/cases/{case_id}/applications",
    response_model=ApiResponse[LenderApplicationResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Add a lender application to a case",
)
async def create_case_application(
    case_id: uuid.UUID,
    payload: LenderApplicationCreateRequest,
    current_user: User = Depends(require_permission(PERM_CASES_UPDATE)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[LenderApplicationResponse]:
    service = LenderApplicationService(db)
    app = await service.create_application(
        org_id=current_user.org_id,
        case_id=case_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=app)


@router.patch(
    "/cases/{case_id}/applications/{id}",
    response_model=ApiResponse[LenderApplicationResponse],
    summary="Update application details (status, sanction terms, disbursal, winning offer)",
)
async def update_case_application(
    case_id: uuid.UUID,
    id: uuid.UUID,
    payload: LenderApplicationUpdateRequest,
    current_user: User = Depends(require_permission(PERM_CASES_UPDATE)),
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[LenderApplicationResponse]:
    service = LenderApplicationService(db)
    app = await service.update_application(
        org_id=current_user.org_id,
        case_id=case_id,
        application_id=id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=app)
