"""
DSA OS — Referrals Router
Endpoints for mobile-first partner lookup, guest lead intake, referral analysis,
and partner commission tracking.
"""

import csv
import io
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user, require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import PERM_REFERRALS_MANAGE, PERM_REFERRALS_READ
from app.modules.referrals.schemas import (
    CommissionCreateRequest,
    CommissionStatusUpdateRequest,
    GuestDocumentUploadResponse,
    GuestLeadSubmissionRequest,
    GuestLeadSubmissionResponse,
    ReferralCommissionResponse,
    ReferralLookupRequest,
    ReferralLookupResponse,
    ReferralPartnerDossierResponse,
    ReferralProfileResponse,
    ReferralProfileUpdateVerification,
)
from app.modules.referrals.service import ReferralService
from app.shared.pagination import build_pagination_meta
from app.shared.schemas import ApiResponse

router = APIRouter(prefix="/referrals", tags=["Referral Partners & Commissions"])


# -----------------------------------------------------------------------------
# Public Guest Referral Endpoints (No login required)
# -----------------------------------------------------------------------------
@router.post("/lookup", response_model=ApiResponse[ReferralLookupResponse])
async def lookup_partner(
    payload: ReferralLookupRequest,
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ReferralLookupResponse]:
    """
    Public mobile-number-first identification.
    Checks whether a referral partner profile exists for the given mobile.
    """
    service = ReferralService(session=session)
    result = await service.lookup_partner(mobile=payload.mobile, org_slug=payload.org_slug)
    return ApiResponse(data=result)


@router.post(
    "/upload-document",
    response_model=ApiResponse[GuestDocumentUploadResponse],
    status_code=status.HTTP_201_CREATED,
)
async def upload_guest_document(
    file: UploadFile = File(...),
    doc_type: str = Form(..., description="aadhaar, pan, or rc"),
    org_slug: str | None = Form(None),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[GuestDocumentUploadResponse]:
    """
    Public guest document quarantine upload.
    Validates file format, size, and uploads to secure quarantined storage.
    """
    service = ReferralService(session=session)
    file_bytes = await file.read()
    result = await service.upload_guest_document(
        file_name=file.filename or f"doc_{doc_type}.pdf",
        content_type=file.content_type or "application/octet-stream",
        file_bytes=file_bytes,
        doc_type=doc_type,
        org_slug=org_slug,
    )
    return ApiResponse(data=result)


@router.post("/submit", response_model=ApiResponse[GuestLeadSubmissionResponse], status_code=status.HTTP_201_CREATED)
@router.post("/guest-submit", response_model=ApiResponse[GuestLeadSubmissionResponse], status_code=status.HTTP_201_CREATED)
async def submit_guest_lead(
    payload: GuestLeadSubmissionRequest,
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[GuestLeadSubmissionResponse]:
    """
    Public guest referral lead intake.
    Captures referral partner info, customer details, loan request, and attribution.
    Enforces mandatory Aadhaar, PAN, and RC (for used vehicles) document requirements.
    """
    service = ReferralService(session=session)
    result = await service.submit_guest_lead(payload=payload)
    return ApiResponse(data=result)


# -----------------------------------------------------------------------------
# Admin Referral Partner Management & Analysis
# -----------------------------------------------------------------------------
@router.get("", response_model=ApiResponse[list[ReferralProfileResponse]])
async def list_referral_partners(
    search: str | None = Query(None),
    verification_status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_permission(PERM_REFERRALS_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[ReferralProfileResponse]]:
    """List referral partners with aggregated lead volume and commission totals."""
    service = ReferralService(session=session)
    items, total = await service.list_referral_profiles(
        org_id=current_user.org_id,
        search=search,
        verification_status=verification_status,
        page=page,
        page_size=page_size,
    )
    meta = build_pagination_meta(total=total, page=page, page_size=page_size)
    return ApiResponse(data=items, meta=meta.model_dump())


@router.get("/export")
async def export_referral_partners_csv(
    current_user: User = Depends(require_permission(PERM_REFERRALS_READ)),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Export referral partners and performance summaries to CSV."""
    service = ReferralService(session=session)
    items, _ = await service.list_referral_profiles(org_id=current_user.org_id, page_size=1000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Partner Name",
        "Mobile Number",
        "Verification Status",
        "Total Leads",
        "Interested Leads",
        "Converted Leads",
        "Pending Commissions (INR)",
        "Approved Commissions (INR)",
        "Paid Commissions (INR)",
        "Registered At",
    ])

    for p in items:
        writer.writerow([
            p.name,
            p.masked_mobile,
            p.verification_status,
            p.total_leads,
            p.interested_leads,
            p.converted_leads,
            float(p.pending_commission_amount),
            float(p.approved_commission_amount),
            float(p.paid_commission_amount),
            p.created_at.strftime("%Y-%m-%d"),
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=referral_partners.csv"},
    )


@router.get("/{profile_id}", response_model=ApiResponse[ReferralPartnerDossierResponse])
async def get_referral_partner_dossier(
    profile_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_REFERRALS_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ReferralPartnerDossierResponse]:
    """Retrieve full partner dossier: profile, referred leads, and commission ledger."""
    service = ReferralService(session=session)
    dossier = await service.get_partner_dossier(org_id=current_user.org_id, profile_id=profile_id)
    return ApiResponse(data=dossier)


@router.patch("/{profile_id}/verification", response_model=ApiResponse[dict[str, Any]])
async def update_verification_status(
    profile_id: uuid.UUID,
    payload: ReferralProfileUpdateVerification,
    current_user: User = Depends(require_permission(PERM_REFERRALS_MANAGE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict[str, Any]]:
    """Verify or reject referral partner profile."""
    service = ReferralService(session=session)
    profile = await service.update_verification(
        org_id=current_user.org_id,
        profile_id=profile_id,
        status=payload.verification_status,
        notes=payload.notes,
        actor_id=current_user.id,
    )
    return ApiResponse(data={"id": str(profile.id), "verification_status": profile.verification_status})


# -----------------------------------------------------------------------------
# Referral Commission Management
# -----------------------------------------------------------------------------
@router.post("/commissions", response_model=ApiResponse[ReferralCommissionResponse], status_code=status.HTTP_201_CREATED)
async def create_referral_commission(
    payload: CommissionCreateRequest,
    current_user: User = Depends(require_permission(PERM_REFERRALS_MANAGE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ReferralCommissionResponse]:
    """Create a new referral partner commission entry."""
    service = ReferralService(session=session)
    comm = await service.create_commission(
        org_id=current_user.org_id,
        payload=payload,
        actor_id=current_user.id,
    )
    return ApiResponse(data=ReferralCommissionResponse.model_validate(comm))


@router.patch("/commissions/{commission_id}", response_model=ApiResponse[ReferralCommissionResponse])
async def update_referral_commission_status(
    commission_id: uuid.UUID,
    payload: CommissionStatusUpdateRequest,
    current_user: User = Depends(require_permission(PERM_REFERRALS_MANAGE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ReferralCommissionResponse]:
    """Approve, reject, or record payment (with UTR) for a commission entry."""
    service = ReferralService(session=session)
    comm = await service.update_commission_status(
        org_id=current_user.org_id,
        commission_id=commission_id,
        payload=payload,
        actor_id=current_user.id,
    )
    return ApiResponse(data=ReferralCommissionResponse.model_validate(comm))
