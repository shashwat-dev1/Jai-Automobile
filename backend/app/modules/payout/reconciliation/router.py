"""
DSA OS — Payout Reconciliation Router
Endpoints for statement ingestion (dry-run & commit), 24h batch reversal,
manual receipt entry (BR-07), auto and manual matching, orphan queues, and clawbacks.
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.auth.permissions import (
    PERM_PAYOUT_READ,
    PERM_PAYOUT_UPDATE,
    PERM_RECON_READ,
    PERM_RECON_UPDATE,
    has_permission,
)
from app.modules.payout.reconciliation.clawback_service import ClawbackService
from app.modules.payout.reconciliation.import_service import ReconciliationImportService
from app.modules.payout.reconciliation.receipt_service import PayoutReceiptService
from app.modules.payout.reconciliation.schemas import (
    ClawbackEventCreate,
    ClawbackEventResponse,
    CommitImportRequest,
    DryRunImportRequest,
    DryRunReportResponse,
    ImportBatchResponse,
    ImportBatchReversalRequest,
    ManualMatchRequest,
    OutstandingReportResponse,
    PayoutReceiptCreate,
    PayoutReceiptResponse,
    ReconciliationResponse,
    StatementColumnMappingCreate,
    StatementColumnMappingResponse,
)
from app.shared.exceptions import PermissionDeniedError

router = APIRouter(prefix="/payout", tags=["Payout Reconciliation"])


def require_recon_read(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not (
        has_permission(user.role, PERM_RECON_READ)
        or has_permission(user.role, PERM_PAYOUT_READ)
    ):
        raise PermissionDeniedError("Insufficient permissions to view reconciliation data.")
    return user


def require_recon_manage(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not (
        has_permission(user.role, PERM_RECON_UPDATE)
        or has_permission(user.role, PERM_PAYOUT_UPDATE)
    ):
        raise PermissionDeniedError("Insufficient permissions to manage reconciliation data.")
    return user


# -----------------------------------------------------------------------------
# Column Mappings
# -----------------------------------------------------------------------------
@router.post("/reconciliation/column-mappings", response_model=StatementColumnMappingResponse)
async def save_column_mapping(
    payload: StatementColumnMappingCreate,
    user: Annotated[User, Depends(require_recon_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StatementColumnMappingResponse:
    """Save or update column mapping configuration for a lender's statement format."""
    service = ReconciliationImportService(db)
    mapping = await service.save_column_mapping(
        org_id=user.org_id,
        payload=payload,
    )
    return StatementColumnMappingResponse.model_validate(mapping)


@router.get(
    "/reconciliation/column-mappings/{lender_id}",
    response_model=list[StatementColumnMappingResponse],
)
async def get_column_mappings(
    lender_id: uuid.UUID,
    user: Annotated[User, Depends(require_recon_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[StatementColumnMappingResponse]:
    """Retrieve all saved column mappings for a lender."""
    service = ReconciliationImportService(db)
    mappings = await service.get_column_mappings(org_id=user.org_id, lender_id=lender_id)
    return [StatementColumnMappingResponse.model_validate(m) for m in mappings]


# -----------------------------------------------------------------------------
# Statement Import (Dry Run, Commit, Reversal)
# -----------------------------------------------------------------------------
@router.post("/reconciliation/import/dry-run", response_model=DryRunReportResponse)
async def dry_run_import(
    payload: DryRunImportRequest,
    user: Annotated[User, Depends(require_recon_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DryRunReportResponse:
    """
    Parse statement CSV and simulate matching against expectations.
    Does not commit any records to the database.
    """
    service = ReconciliationImportService(db)
    return await service.dry_run_import(
        org_id=user.org_id,
        lender_id=payload.lender_id,
        filename=payload.filename,
        csv_content=payload.csv_content,
        column_mapping=payload.column_mapping,
        tolerance=payload.tolerance,
    )


@router.post(
    "/reconciliation/import/commit",
    response_model=ImportBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def commit_import(
    payload: CommitImportRequest,
    user: Annotated[User, Depends(require_recon_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImportBatchResponse:
    """
    Commit statement import batch: creates PayoutReceipt records,
    auto-matches against expectations within tolerance, and logs an audit event.
    """
    service = ReconciliationImportService(db)
    batch = await service.commit_import(
        org_id=user.org_id,
        lender_id=payload.lender_id,
        filename=payload.filename,
        csv_content=payload.csv_content,
        column_mapping=payload.column_mapping,
        actor_id=user.id,
        actor_role=user.role,
        tolerance=payload.tolerance,
    )
    return ImportBatchResponse.model_validate(batch)


@router.post("/reconciliation/batches/{batch_id}/reverse", response_model=ImportBatchResponse)
async def reverse_import_batch(
    batch_id: uuid.UUID,
    payload: ImportBatchReversalRequest,
    user: Annotated[User, Depends(require_recon_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImportBatchResponse:
    """
    Reverse a committed statement import batch within the 24-hour window (FR-PAY-008).
    Unwinds reconciliation matches and removes imported receipts.
    """
    service = ReconciliationImportService(db)
    batch = await service.reverse_import_batch(
        org_id=user.org_id,
        batch_id=batch_id,
        reversal_reason=payload.reversal_reason,
        actor_id=user.id,
        actor_role=user.role,
    )
    return ImportBatchResponse.model_validate(batch)


@router.get("/reconciliation/batches", response_model=list[ImportBatchResponse])
async def list_import_batches(
    user: Annotated[User, Depends(require_recon_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    lender_id: uuid.UUID | None = Query(None, description="Filter by lender"),
    batch_status: str | None = Query(None, alias="status", description="Filter by status"),
) -> list[ImportBatchResponse]:
    """List historical statement import batches."""
    service = ReconciliationImportService(db)
    batches = await service.list_batches(
        org_id=user.org_id,
        lender_id=lender_id,
        status=batch_status,
    )
    return [
        ImportBatchResponse(
            id=b.id,
            org_id=b.org_id,
            lender_id=b.lender_id,
            lender_name=b.lender.name if b.lender else None,
            filename=b.filename,
            total_rows=b.total_rows,
            matched_rows=b.matched_rows,
            unmatched_rows=b.unmatched_rows,
            error_rows=b.error_rows,
            total_received_amount=b.total_received_amount,
            status=b.status,
            reversed_at=b.reversed_at,
            reversal_reason=b.reversal_reason,
            created_by=b.created_by,
            created_at=b.created_at,
            updated_at=b.updated_at,
        )
        for b in batches
    ]


# -----------------------------------------------------------------------------
# Receipts Management
# -----------------------------------------------------------------------------
@router.post(
    "/receipts",
    response_model=PayoutReceiptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_receipt(
    payload: PayoutReceiptCreate,
    user: Annotated[User, Depends(require_recon_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PayoutReceiptResponse:
    """
    Manually create a bank commission payout receipt.
    Enforces BR-07: Linking to a case requires the case to be in disbursed status.
    """
    service = PayoutReceiptService(db)
    receipt = await service.create_receipt(
        org_id=user.org_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )
    return PayoutReceiptResponse.model_validate(receipt)


@router.get("/receipts", response_model=list[PayoutReceiptResponse])
async def list_receipts(
    user: Annotated[User, Depends(require_recon_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    match_status: str | None = Query(None, description="Filter by match status"),
    lender_id: uuid.UUID | None = Query(None, description="Filter by lender"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[PayoutReceiptResponse]:
    """List bank commission receipts with optional filtering."""
    service = PayoutReceiptService(db)
    receipts = await service.list_receipts(
        org_id=user.org_id,
        match_status=match_status,
        lender_id=lender_id,
        limit=limit,
        offset=offset,
    )
    return [
        PayoutReceiptResponse(
            id=r.id,
            org_id=r.org_id,
            lender_id=r.lender_id,
            lender_name=r.lender.name if r.lender else None,
            import_batch_id=r.import_batch_id,
            loan_account_no=r.loan_account_no,
            customer_name=r.customer_name,
            received_amount=r.received_amount,
            tds_amount=r.tds_amount,
            net_amount=r.net_amount,
            payment_date=r.payment_date,
            utr_reference=r.utr_reference,
            match_status=r.match_status,
            case_id=r.case_id,
            case_no=r.case.case_no if r.case else None,
            lender_application_id=r.lender_application_id,
            notes=r.notes,
            version=r.version,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in receipts
    ]


@router.get("/receipts/unmatched", response_model=list[PayoutReceiptResponse])
async def get_unmatched_receipts(
    user: Annotated[User, Depends(require_recon_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    lender_id: uuid.UUID | None = Query(None, description="Filter by lender"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[PayoutReceiptResponse]:
    """Retrieve orphan / unmatched receipts queue requiring resolution."""
    service = PayoutReceiptService(db)
    receipts = await service.get_unmatched_receipts(
        org_id=user.org_id,
        lender_id=lender_id,
        limit=limit,
        offset=offset,
    )
    return [
        PayoutReceiptResponse(
            id=r.id,
            org_id=r.org_id,
            lender_id=r.lender_id,
            lender_name=r.lender.name if r.lender else None,
            import_batch_id=r.import_batch_id,
            loan_account_no=r.loan_account_no,
            customer_name=r.customer_name,
            received_amount=r.received_amount,
            tds_amount=r.tds_amount,
            net_amount=r.net_amount,
            payment_date=r.payment_date,
            utr_reference=r.utr_reference,
            match_status=r.match_status,
            case_id=r.case_id,
            case_no=r.case.case_no if r.case else None,
            lender_application_id=r.lender_application_id,
            notes=r.notes,
            version=r.version,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in receipts
    ]


# -----------------------------------------------------------------------------
# Reconciliation & Missing Queue
# -----------------------------------------------------------------------------
@router.post("/reconciliation/match", response_model=ReconciliationResponse)
async def manual_match(
    payload: ManualMatchRequest,
    user: Annotated[User, Depends(require_recon_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReconciliationResponse:
    """Manually match an expected payout receivable with an actual bank credit."""
    service = PayoutReceiptService(db)
    recon = await service.manual_match(
        org_id=user.org_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )
    return ReconciliationResponse.model_validate(recon)


@router.get("/reconciliation/missing-expectations")
async def get_missing_expectations(
    user: Annotated[User, Depends(require_recon_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days_threshold: int = Query(45, ge=1, le=365, description="Days overdue threshold"),
) -> list[dict[str, object]]:
    """Retrieve expectations missing receipts older than threshold days."""
    service = PayoutReceiptService(db)
    expectations = await service.get_missing_expectations(
        org_id=user.org_id,
        days_threshold=days_threshold,
    )
    return [
        {
            "id": str(e.id),
            "case_id": str(e.case_id),
            "case_no": e.case.case_no,
            "applicant_name": (
                e.case.case_parties[0].party.name
                if e.case.case_parties
                else None
            ),
            "lender_id": str(e.lender_application.lender_id),
            "lender_name": e.lender_application.lender.name if e.lender_application.lender else None,
            "disbursal_date": (
                e.lender_application.disbursal_date.isoformat()
                if e.lender_application.disbursal_date
                else None
            ),
            "disbursal_amount": str(e.disbursal_amount),
            "gross_amount": str(e.gross_amount),
            "net_amount": str(e.net_amount),
            "status": e.status,
            "days_overdue": (
                (date.today() - (e.lender_application.disbursal_date or e.created_at.date())).days
            ),
        }
        for e in expectations
    ]


@router.get("/reconciliation/outstanding", response_model=OutstandingReportResponse)
async def get_outstanding_report(
    user: Annotated[User, Depends(require_recon_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OutstandingReportResponse:
    """Aggregate outstanding payout receivables with lender ageing breakdown."""
    service = PayoutReceiptService(db)
    return await service.get_outstanding_report(org_id=user.org_id)


# -----------------------------------------------------------------------------
# Clawbacks
# -----------------------------------------------------------------------------
@router.post(
    "/reconciliation/clawbacks",
    response_model=ClawbackEventResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_clawback(
    payload: ClawbackEventCreate,
    user: Annotated[User, Depends(require_recon_manage)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClawbackEventResponse:
    """Record a post-disbursal commission clawback event."""
    service = ClawbackService(db)
    event = await service.create_clawback(
        org_id=user.org_id,
        payload=payload,
        actor_id=user.id,
        actor_role=user.role,
    )
    return ClawbackEventResponse.model_validate(event)


@router.get("/reconciliation/clawbacks", response_model=list[ClawbackEventResponse])
async def list_clawbacks(
    user: Annotated[User, Depends(require_recon_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    case_id: uuid.UUID | None = Query(None, description="Filter by case"),
    clawback_status: str | None = Query(None, alias="status", description="Filter by status"),
) -> list[ClawbackEventResponse]:
    """List clawback events."""
    service = ClawbackService(db)
    events = await service.list_clawbacks(
        org_id=user.org_id,
        case_id=case_id,
        status=clawback_status,
    )
    return [
        ClawbackEventResponse(
            id=e.id,
            org_id=e.org_id,
            case_id=e.case_id,
            case_no=e.case.case_no if e.case else None,
            lender_application_id=e.lender_application_id,
            expectation_id=e.expectation_id,
            receipt_id=e.receipt_id,
            clawback_amount=e.clawback_amount,
            reason=e.reason,
            effective_date=e.effective_date,
            status=e.status,
            created_by=e.created_by,
            created_at=e.created_at,
            updated_at=e.updated_at,
        )
        for e in events
    ]
