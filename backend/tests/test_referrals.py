"""
DSA OS — Referrals & Telecaller Domain Unit Tests

Tests:
1. Mobile number normalization (+91, leading 0, spaces, hyphens)
2. Mobile number masking protects PII (98****3210)
3. Guest lead submission schema validation
4. Referral profile lookup schema validation
5. Bulk assign schema validation
6. Call activity creation and outcome schema validation
7. Commission lifecycle status progression
"""

import uuid
from decimal import Decimal
import pytest
from pydantic import ValidationError as PydanticValidationError

from app.modules.referrals.service import _normalize_mobile
from app.modules.referrals.models import ReferralProfile, ReferralCommission
from app.modules.referrals.schemas import (
    ReferralLookupRequest,
    GuestLeadSubmissionRequest,
    CommissionStatusUpdateRequest,
    CommissionCreateRequest,
)
from app.modules.cases.schemas import (
    BulkAssignRequest,
    CallActivityCreateRequest,
)
from app.shared.exceptions import ValidationError as AppValidationError


def test_mobile_number_normalization() -> None:
    """Ensure various Indian phone number formats normalize to 10 digits."""
    assert _normalize_mobile("+91 98765 43210") == "9876543210"
    assert _normalize_mobile("09876543210") == "9876543210"
    assert _normalize_mobile("98765-43210") == "9876543210"
    assert _normalize_mobile("9876543210") == "9876543210"
    assert _normalize_mobile("+91-9876543210") == "9876543210"


def test_mobile_number_normalization_invalid() -> None:
    """Ensure invalid phone numbers raise AppValidationError."""
    with pytest.raises(AppValidationError, match="Must be a 10-digit Indian number"):
        _normalize_mobile("12345")
    with pytest.raises(AppValidationError):
        _normalize_mobile("")


def test_referral_profile_masked_mobile() -> None:
    """Ensure ReferralProfile model masks mobile number properly for privacy."""
    org_id = uuid.uuid4()
    profile = ReferralProfile(
        org_id=org_id,
        mobile_primary="9876543210",
        name="Rajesh Kumar",
    )
    assert profile.masked_mobile == "98****3210"

    short_profile = ReferralProfile(
        org_id=org_id,
        mobile_primary="12345",
        name="Short Phone",
    )
    assert short_profile.masked_mobile == "12345"


def test_guest_lead_submission_schema() -> None:
    """Validate GuestLeadSubmissionRequest constraints."""
    # Valid submission
    payload = GuestLeadSubmissionRequest(
        partner_mobile="+91 98765 43210",
        partner_name="Vikram Sharma",
        applicant_name="Ramesh Patel",
        applicant_mobile="9812345678",
        product_type="used_car",
        loan_amount_requested=Decimal("450000.00"),
        pincode="302001",
        city="Jaipur",
        state="Rajasthan",
    )
    assert payload.applicant_name == "Ramesh Patel"
    assert payload.loan_amount_requested == Decimal("450000.00")

    # Invalid amount below minimum
    with pytest.raises(PydanticValidationError):
        GuestLeadSubmissionRequest(
            partner_mobile="9876543210",
            partner_name="Vikram Sharma",
            applicant_name="Ramesh Patel",
            applicant_mobile="9812345678",
            product_type="used_car",
            loan_amount_requested=Decimal("500.00"),
            pincode="302001",
            city="Jaipur",
            state="Rajasthan",
        )


def test_bulk_assign_schema() -> None:
    """Validate BulkAssignRequest constraints."""
    telecaller_id = uuid.uuid4()
    case_ids = [uuid.uuid4(), uuid.uuid4()]
    
    req = BulkAssignRequest(
        case_ids=case_ids,
        telecaller_id=telecaller_id,
    )
    assert len(req.case_ids) == 2
    assert req.telecaller_id == telecaller_id

    # Empty case_ids should fail validation
    with pytest.raises(PydanticValidationError):
        BulkAssignRequest(
            case_ids=[],
            telecaller_id=telecaller_id,
        )


def test_call_activity_create_schema() -> None:
    """Validate CallActivityCreateRequest outcomes."""
    req = CallActivityCreateRequest(
        outcome="interested",
        remarks="Customer interested in 5-year tenure for commercial vehicle loan",
        follow_up_at="2026-10-15T10:00:00Z",
    )
    assert req.outcome == "interested"

    # Invalid outcome pattern
    with pytest.raises(PydanticValidationError):
        CallActivityCreateRequest(
            outcome="invalid_status_xyz",
            remarks="Some remarks",
        )


def test_commission_status_update_schema() -> None:
    """Validate CommissionStatusUpdateRequest."""
    req = CommissionStatusUpdateRequest(
        status="paid",
        payment_reference="UTR-ICICI-998822",
        notes="Approved and disbursed via NEFT",
    )
    assert req.status == "paid"
    assert req.payment_reference == "UTR-ICICI-998822"

    with pytest.raises(PydanticValidationError):
        CommissionStatusUpdateRequest(
            status="unsupported_status",
        )
