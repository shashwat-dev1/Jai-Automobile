"""
DSA OS — Post-Disbursal Documents (PDD) Router
Endpoints for PDD board, application PDD items, and status updates.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.auth.permissions import (
    PERM_PDD_MANAGE,
    PERM_PDD_READ,
    has_permission,
)
from app.modules.pdd.schemas import (
    PDDBoardResponse,
    PDDItemCreateRequest,
    PDDItemResponse,
    PDDItemUpdateRequest,
)
from app.modules.pdd.service import PDDService
from app.shared.exceptions import PermissionDeniedError

router = APIRouter(prefix="", tags=["Post-Disbursal Documents (PDD)"])


def require_pdd_read(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not has_permission(user.role, PERM_PDD_READ):
        raise PermissionDeniedError("Insufficient permissions to view PDD items.")
    return user


def require_pdd_manage(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not has_permission(user.role, PERM_PDD_MANAGE):
        raise PermissionDeniedError("Insufficient permissions to manage PDD items.")
    return user


@router.get("/pdd", response_model=PDDBoardResponse)
@router.get("/pdd/board", response_model=PDDBoardResponse)
async def get_pdd_board(
    user: Annotated[User, Depends(require_pdd_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = Query(None, description="Filter by item status"),
    lender_id: uuid.UUID | None = Query(None, description="Filter by lender"),
    bucket: str | None = Query(None, description="Filter by ageing bucket (0_7, 8_15, 16_30, 30_plus)"),
    owner_id: uuid.UUID | None = Query(None, description="Filter by assigned owner"),
) -> PDDBoardResponse:
    """Fetch all PDD items grouped by ageing buckets (FR-WFL-007)."""
    service = PDDService(db)
    return await service.get_pdd_board(
        org_id=user.org_id,
        status=status,
        lender_id=lender_id,
        bucket=bucket,
        owner_id=owner_id,
    )


@router.get("/cases/{case_id}/applications/{app_id}/pdd", response_model=list[PDDItemResponse])
async def get_application_pdd_items(
    case_id: uuid.UUID,
    app_id: uuid.UUID,
    user: Annotated[User, Depends(require_pdd_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PDDItemResponse]:
    """Fetch all PDD items for a specific lender application."""
    service = PDDService(db)
    return await service.get_pdd_items_for_application(
        org_id=user.org_id,
        case_id=case_id,
        application_id=app_id,
    )


@router.get("/pdd/{pdd_id}", response_model=PDDItemResponse)
async def get_pdd_item(
    pdd_id: uuid.UUID,
    user: Annotated[User, Depends(require_pdd_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PDDItemResponse:
    """Fetch single PDD item dossier."""
    service = PDDService(db)
    item = await service.get_pdd_item(org_id=user.org_id, pdd_id=pdd_id)
    return await service._to_response(item)


@router.post("/pdd", response_model=PDDItemResponse, status_code=201)
async def create_pdd_item(
    payload: PDDItemCreateRequest,
    user: Annotated[User, Depends(require_pdd_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PDDItemResponse:
    """Ad-hoc create a PDD requirement item on an application."""
    service = PDDService(db)
    return await service.create_pdd_item(
        org_id=user.org_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )


@router.patch("/pdd/{pdd_id}", response_model=PDDItemResponse)
async def update_pdd_item(
    pdd_id: uuid.UUID,
    payload: PDDItemUpdateRequest,
    user: Annotated[User, Depends(require_pdd_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PDDItemResponse:
    """Update PDD item status, collection dates, lender submission ref, or rejection."""
    service = PDDService(db)
    return await service.update_pdd_item(
        org_id=user.org_id,
        pdd_id=pdd_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )
