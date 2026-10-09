"""
DSA OS — Sources Router
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import PERM_CASES_CREATE, PERM_CASES_READ
from app.modules.sources.schemas import SourceCreate, SourceResponse, SourceUpdate
from app.modules.sources.service import SourceService
from app.shared.schemas import ApiResponse

router = APIRouter(prefix="/sources", tags=["Lead Sources"])


@router.get("", response_model=ApiResponse[list[SourceResponse]])
async def list_sources(
    active_only: bool = Query(True),
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[SourceResponse]]:
    """List lead sources."""
    service = SourceService(session=session)
    sources = await service.list_sources(org_id=current_user.org_id, active_only=active_only)
    return ApiResponse(data=sources)


@router.post("", response_model=ApiResponse[SourceResponse], status_code=status.HTTP_201_CREATED)
async def create_source(
    payload: SourceCreate,
    current_user: User = Depends(require_permission(PERM_CASES_CREATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[SourceResponse]:
    """Create a new lead source."""
    service = SourceService(session=session)
    source = await service.create_source(org_id=current_user.org_id, payload=payload)
    return ApiResponse(data=source)


@router.get("/{source_id}", response_model=ApiResponse[SourceResponse])
async def get_source(
    source_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[SourceResponse]:
    """Get single source details."""
    service = SourceService(session=session)
    source = await service.get_source(org_id=current_user.org_id, source_id=source_id)
    return ApiResponse(data=source)


@router.patch("/{source_id}", response_model=ApiResponse[SourceResponse])
async def update_source(
    source_id: uuid.UUID,
    payload: SourceUpdate,
    current_user: User = Depends(require_permission(PERM_CASES_CREATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[SourceResponse]:
    """Update lead source."""
    service = SourceService(session=session)
    source = await service.update_source(
        org_id=current_user.org_id, source_id=source_id, payload=payload
    )
    return ApiResponse(data=source)
