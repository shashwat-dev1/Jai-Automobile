"""
DSA OS — Payout Router
Exposes endpoints for commission grids (payout rules), expectations, overrides, splits, and attention list.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.auth.permissions import (
    PERM_PAYOUT_READ,
    PERM_PAYOUT_UPDATE,
    has_permission,
)
from app.modules.payout.schemas import (
    PayoutAttentionItem,
    PayoutExpectationOverrideRequest,
    PayoutExpectationResponse,
    PayoutRuleCreateRequest,
    PayoutRuleResponse,
    PayoutRuleUpdateRequest,
    PayoutSplitResponse,
    PayoutSplitsUpdateRequest,
)
from app.modules.payout.service import PayoutService
from app.shared.exceptions import PermissionDeniedError

router = APIRouter(prefix="", tags=["Payout Engine"])


def require_payout_read(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not has_permission(user.role, PERM_PAYOUT_READ):
        raise PermissionDeniedError("Insufficient permissions to view payout information.")
    return user


def require_payout_manage(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not has_permission(user.role, PERM_PAYOUT_UPDATE):
        raise PermissionDeniedError("Insufficient permissions to manage payout rules and overrides.")
    return user


# -----------------------------------------------------------------------------
# Payout Rules Endpoints
# -----------------------------------------------------------------------------
@router.get("/payout/rules", response_model=list[PayoutRuleResponse])
async def list_payout_rules(
    user: Annotated[User, Depends(require_payout_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    lender_id: uuid.UUID | None = Query(None, description="Filter by lender"),
    product: str | None = Query(None, description="Filter by loan product"),
    is_active: bool | None = Query(None, description="Filter active/inactive rules"),
) -> list[PayoutRuleResponse]:
    """List effective-dated commission grid rules."""
    service = PayoutService(db)
    return await service.list_rules(
        org_id=user.org_id,
        lender_id=lender_id,
        product=product,
        is_active=is_active,
    )


@router.post("/payout/rules", response_model=PayoutRuleResponse, status_code=201)
async def create_payout_rule(
    payload: PayoutRuleCreateRequest,
    user: Annotated[User, Depends(require_payout_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PayoutRuleResponse:
    """Create a new effective-dated commission grid rule."""
    service = PayoutService(db)
    return await service.create_rule(
        org_id=user.org_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )


@router.get("/payout/rules/{rule_id}", response_model=PayoutRuleResponse)
async def get_payout_rule(
    rule_id: uuid.UUID,
    user: Annotated[User, Depends(require_payout_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PayoutRuleResponse:
    """Get single payout rule by ID."""
    service = PayoutService(db)
    rule = await service.get_rule(org_id=user.org_id, rule_id=rule_id)
    return PayoutRuleResponse(
        id=rule.id,
        org_id=rule.org_id,
        lender_id=rule.lender_id,
        lender_name=rule.lender.name if rule.lender else None,
        product=rule.product,
        effective_from=rule.effective_from,
        effective_to=rule.effective_to,
        basis=rule.basis,
        rate_percent=rule.rate_percent,
        flat_amount=rule.flat_amount,
        slabs=rule.slabs,
        conditions=rule.conditions,
        gating_type=rule.gating_type,
        tds_rate_percent=rule.tds_rate_percent,
        gst_mode=rule.gst_mode,
        is_active=rule.is_active,
        version=rule.version,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.patch("/payout/rules/{rule_id}", response_model=PayoutRuleResponse)
async def update_payout_rule(
    rule_id: uuid.UUID,
    payload: PayoutRuleUpdateRequest,
    user: Annotated[User, Depends(require_payout_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PayoutRuleResponse:
    """Update an existing payout rule."""
    service = PayoutService(db)
    return await service.update_rule(
        org_id=user.org_id,
        rule_id=rule_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )


# -----------------------------------------------------------------------------
# Payout Expectations Endpoints
# -----------------------------------------------------------------------------
@router.get("/payout/expectations", response_model=list[PayoutExpectationResponse])
async def list_payout_expectations(
    user: Annotated[User, Depends(require_payout_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = Query(None, description="Filter by status (held, due, no_rule, paid, clawback)"),
    case_id: uuid.UUID | None = Query(None, description="Filter by case ID"),
) -> list[PayoutExpectationResponse]:
    """List calculated payout expectations."""
    service = PayoutService(db)
    return await service.list_expectations(
        org_id=user.org_id,
        status=status,
        case_id=case_id,
    )


@router.get("/payout/expectations/attention", response_model=list[PayoutAttentionItem])
async def get_payout_attention_list(
    user: Annotated[User, Depends(require_payout_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PayoutAttentionItem]:
    """
    Get Attention List:
    - 'no_rule' expectations missing commission rules
    - 'held' expectations awaiting PDD lender acknowledgement
    """
    service = PayoutService(db)
    return await service.get_attention_list(org_id=user.org_id)


@router.get("/payout/expectations/{expectation_id}", response_model=PayoutExpectationResponse)
async def get_payout_expectation(
    expectation_id: uuid.UUID,
    user: Annotated[User, Depends(require_payout_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PayoutExpectationResponse:
    """Get single payout expectation details including frozen rule snapshot and splits."""
    service = PayoutService(db)
    return await service.get_expectation(org_id=user.org_id, expectation_id=expectation_id)


@router.post("/payout/expectations/{expectation_id}/override", response_model=PayoutExpectationResponse)
async def override_payout_expectation(
    expectation_id: uuid.UUID,
    payload: PayoutExpectationOverrideRequest,
    user: Annotated[User, Depends(require_payout_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PayoutExpectationResponse:
    """
    Manually override payout expectation gross amount (FR-PAY-005).
    Preserves original calculated amount, requires justification reason, updates net and TDS.
    """
    service = PayoutService(db)
    return await service.override_expectation(
        org_id=user.org_id,
        expectation_id=expectation_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )


# -----------------------------------------------------------------------------
# Payout Splits Endpoints (BR-09)
# -----------------------------------------------------------------------------
@router.put("/payout/expectations/{expectation_id}/splits", response_model=list[PayoutSplitResponse])
async def update_payout_splits(
    expectation_id: uuid.UUID,
    payload: PayoutSplitsUpdateRequest,
    user: Annotated[User, Depends(require_payout_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PayoutSplitResponse]:
    """
    Update sub-DSA / executive commission splits for an expected payout (BR-09).
    Enforces total percentage <= 100% and total split amount <= gross expectation.
    """
    service = PayoutService(db)
    return await service.update_splits(
        org_id=user.org_id,
        expectation_id=expectation_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )
