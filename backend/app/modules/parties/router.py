"""
DSA OS — Parties Router
"""

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import PERM_CASES_CREATE, PERM_CASES_READ, PERM_CASES_UPDATE
from app.modules.parties.schemas import (
    PartyCreate,
    PartyCreateResponse,
    PartyResponse,
    PartyRevealRequest,
    PartyRevealResponse,
    PartyUpdate,
)
from app.modules.parties.service import PartyService
from app.shared.pagination import build_pagination_meta
from app.shared.schemas import ApiResponse

router = APIRouter(prefix="/parties", tags=["Parties & Customers"])


@router.get("", response_model=ApiResponse[list[PartyResponse]])
async def list_parties(
    query: str | None = Query(None),
    mobile: str | None = Query(None),
    pan_last_four: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[PartyResponse]]:
    """Search parties across the organization."""
    service = PartyService(session=session)
    parties, total = await service.search_parties(
        org_id=current_user.org_id,
        query=query,
        mobile=mobile,
        pan_last_four=pan_last_four,
        page=page,
        page_size=page_size,
    )
    meta = build_pagination_meta(total=total, page=page, page_size=page_size)
    return ApiResponse(data=parties, meta=meta.model_dump())


@router.post(
    "", response_model=ApiResponse[PartyCreateResponse], status_code=status.HTTP_201_CREATED
)
async def create_party(
    payload: PartyCreate,
    current_user: User = Depends(require_permission(PERM_CASES_CREATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PartyCreateResponse]:
    """Create a new party with duplicate detection and PAN encryption."""
    service = PartyService(session=session)
    party, duplicate_warnings = await service.create_party(
        org_id=current_user.org_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=PartyCreateResponse(party=party, duplicate_warnings=duplicate_warnings))


@router.get("/{party_id}", response_model=ApiResponse[PartyResponse])
async def get_party(
    party_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PartyResponse]:
    """Get masked party details."""
    service = PartyService(session=session)
    party = await service.get_party(org_id=current_user.org_id, party_id=party_id)
    return ApiResponse(data=party)


@router.patch("/{party_id}", response_model=ApiResponse[PartyResponse])
async def update_party(
    party_id: uuid.UUID,
    payload: PartyUpdate,
    current_user: User = Depends(require_permission(PERM_CASES_UPDATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PartyResponse]:
    """Update party details with optimistic locking."""
    service = PartyService(session=session)
    party = await service.update_party(
        org_id=current_user.org_id,
        party_id=party_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=party)


@router.post("/{party_id}/reveal", response_model=ApiResponse[PartyRevealResponse])
async def reveal_sensitive_field(
    party_id: uuid.UUID,
    payload: PartyRevealRequest,
    request: Request,
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PartyRevealResponse]:
    """
    Reveal full unmasked PAN or mobile number.
    Strictly recorded in immutable audit log.
    """
    service = PartyService(session=session)
    ip_address = request.client.host if request.client else None
    result = await service.reveal_sensitive_field(
        org_id=current_user.org_id,
        party_id=party_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
        ip_address=ip_address,
    )
    return ApiResponse(data=result)
