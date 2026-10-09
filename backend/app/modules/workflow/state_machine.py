"""
DSA OS — Application State Machine and Transition Graph
Implements transition rules per Data Dictionary Section 1.3 and SRS Appendix C.
"""

from typing import Final

from app.shared.exceptions import BusinessRuleViolationError, ConflictError

# Canonical Lender Application Statuses
APP_STATUS_LOGGED_IN: Final = "logged_in"
APP_STATUS_UNDER_VERIFICATION: Final = "under_verification"
APP_STATUS_QUERY_RAISED: Final = "query_raised"
APP_STATUS_SANCTIONED: Final = "sanctioned"
APP_STATUS_ACCEPTED_BY_CUSTOMER: Final = "accepted_by_customer"
APP_STATUS_DECLINED_BY_CUSTOMER: Final = "declined_by_customer"
APP_STATUS_DISBURSED: Final = "disbursed"
APP_STATUS_REJECTED: Final = "rejected"
APP_STATUS_CANCELLED: Final = "cancelled"

ALL_APP_STATUSES: set[str] = {
    APP_STATUS_LOGGED_IN,
    APP_STATUS_UNDER_VERIFICATION,
    APP_STATUS_QUERY_RAISED,
    APP_STATUS_SANCTIONED,
    APP_STATUS_ACCEPTED_BY_CUSTOMER,
    APP_STATUS_DECLINED_BY_CUSTOMER,
    APP_STATUS_DISBURSED,
    APP_STATUS_REJECTED,
    APP_STATUS_CANCELLED,
}

# Directed graph of allowed transitions
ALLOWED_APP_TRANSITIONS: dict[str, set[str]] = {
    APP_STATUS_LOGGED_IN: {
        APP_STATUS_UNDER_VERIFICATION,
        APP_STATUS_REJECTED,
        APP_STATUS_CANCELLED,
    },
    APP_STATUS_UNDER_VERIFICATION: {
        APP_STATUS_QUERY_RAISED,
        APP_STATUS_SANCTIONED,
        APP_STATUS_REJECTED,
        APP_STATUS_CANCELLED,
    },
    APP_STATUS_QUERY_RAISED: {
        APP_STATUS_UNDER_VERIFICATION,
        APP_STATUS_REJECTED,
        APP_STATUS_CANCELLED,
    },
    APP_STATUS_SANCTIONED: {
        APP_STATUS_ACCEPTED_BY_CUSTOMER,
        APP_STATUS_DECLINED_BY_CUSTOMER,
        APP_STATUS_CANCELLED,
    },
    APP_STATUS_ACCEPTED_BY_CUSTOMER: {
        APP_STATUS_DISBURSED,
        APP_STATUS_CANCELLED,
    },
    APP_STATUS_DECLINED_BY_CUSTOMER: set(),
    APP_STATUS_DISBURSED: set(),
    APP_STATUS_REJECTED: set(),
    APP_STATUS_CANCELLED: set(),
}

VALID_REJECTION_REASONS: set[str] = {
    "cibil_score_low",
    "income_inadequate",
    "dti_high",
    "negative_profile",
    "vehicle_age_exceeded",
    "document_fraud",
    "lender_policy_norm",
    "address_verification_failed",
    "other",
}


def validate_application_transition(
    current_status: str,
    target_status: str,
    rejection_reason_code: str | None = None,
) -> None:
    """
    Validate that transition from current_status to target_status is permitted.
    Returns 409 Conflict with allowed next states on invalid transition (FR-WFL-001).
    Enforces BR-04: moving to rejected requires a valid rejection reason code.
    """
    if target_status not in ALL_APP_STATUSES:
        raise BusinessRuleViolationError(
            f"Unknown target lender application status: '{target_status}'"
        )

    if current_status == target_status:
        return

    allowed = ALLOWED_APP_TRANSITIONS.get(current_status, set())
    if target_status not in allowed:
        raise ConflictError(
            f"Cannot transition lender application from '{current_status}' to '{target_status}'. "
            f"Allowed next states: {sorted(allowed)}",
            code="INVALID_STATUS_TRANSITION",
        )

    if target_status == APP_STATUS_REJECTED:
        if not rejection_reason_code or not rejection_reason_code.strip():
            raise BusinessRuleViolationError(
                "BR-04: Rejection reason code is mandatory when rejecting a lender application.",
                code="REJECTION_REASON_REQUIRED",
            )
        if rejection_reason_code not in VALID_REJECTION_REASONS:
            raise BusinessRuleViolationError(
                f"Invalid rejection reason code '{rejection_reason_code}'. Must be one of: {sorted(VALID_REJECTION_REASONS)}",
                code="INVALID_REJECTION_REASON",
            )
