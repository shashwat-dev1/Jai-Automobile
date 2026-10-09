"""
DSA OS — Case Lifecycle State Machine
Authoritative transition graph per SRS Appendix C and Data Dictionary.
"""

from typing import Final

from app.shared.exceptions import BusinessRuleViolationError, StateTransitionError

CASE_STATUS_LEAD: Final = "lead"
CASE_STATUS_LEAD_QUALIFIED: Final = "lead_qualified"
CASE_STATUS_DOCS_IN_PROGRESS: Final = "docs_in_progress"
CASE_STATUS_DOCS_COLLECTED: Final = "docs_collected"
CASE_STATUS_FILE_LOGGED_IN: Final = "file_logged_in"
CASE_STATUS_IN_REVIEW_LENDER: Final = "in_review_lender"
CASE_STATUS_QUERIES_RAISED: Final = "queries_raised"
CASE_STATUS_SANCTIONED: Final = "sanctioned"
CASE_STATUS_DISBURSED: Final = "disbursed"
CASE_STATUS_PDD_PENDING: Final = "pdd_pending"
CASE_STATUS_PDD_COMPLETED: Final = "pdd_completed"
CASE_STATUS_CLOSED: Final = "closed"
CASE_STATUS_REJECTED: Final = "rejected"
CASE_STATUS_WITHDRAWN: Final = "withdrawn"

ALL_CASE_STATUSES: set[str] = {
    CASE_STATUS_LEAD,
    CASE_STATUS_LEAD_QUALIFIED,
    CASE_STATUS_DOCS_IN_PROGRESS,
    CASE_STATUS_DOCS_COLLECTED,
    CASE_STATUS_FILE_LOGGED_IN,
    CASE_STATUS_IN_REVIEW_LENDER,
    CASE_STATUS_QUERIES_RAISED,
    CASE_STATUS_SANCTIONED,
    CASE_STATUS_DISBURSED,
    CASE_STATUS_PDD_PENDING,
    CASE_STATUS_PDD_COMPLETED,
    CASE_STATUS_CLOSED,
    CASE_STATUS_REJECTED,
    CASE_STATUS_WITHDRAWN,
}

# Directed graph of allowed transitions: from_status -> set of allowed to_statuses
ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    CASE_STATUS_LEAD: {
        CASE_STATUS_LEAD_QUALIFIED,
        CASE_STATUS_WITHDRAWN,
        CASE_STATUS_REJECTED,
    },
    CASE_STATUS_LEAD_QUALIFIED: {
        CASE_STATUS_DOCS_IN_PROGRESS,
        CASE_STATUS_WITHDRAWN,
        CASE_STATUS_REJECTED,
    },
    CASE_STATUS_DOCS_IN_PROGRESS: {
        CASE_STATUS_DOCS_COLLECTED,
        CASE_STATUS_WITHDRAWN,
        CASE_STATUS_REJECTED,
    },
    CASE_STATUS_DOCS_COLLECTED: {
        CASE_STATUS_FILE_LOGGED_IN,
        CASE_STATUS_DOCS_IN_PROGRESS,
        CASE_STATUS_WITHDRAWN,
        CASE_STATUS_REJECTED,
    },
    CASE_STATUS_FILE_LOGGED_IN: {
        CASE_STATUS_IN_REVIEW_LENDER,
        CASE_STATUS_QUERIES_RAISED,
        CASE_STATUS_SANCTIONED,
        CASE_STATUS_REJECTED,
        CASE_STATUS_WITHDRAWN,
    },
    CASE_STATUS_IN_REVIEW_LENDER: {
        CASE_STATUS_QUERIES_RAISED,
        CASE_STATUS_SANCTIONED,
        CASE_STATUS_REJECTED,
        CASE_STATUS_WITHDRAWN,
    },
    CASE_STATUS_QUERIES_RAISED: {
        CASE_STATUS_IN_REVIEW_LENDER,
        CASE_STATUS_SANCTIONED,
        CASE_STATUS_REJECTED,
        CASE_STATUS_WITHDRAWN,
    },
    CASE_STATUS_SANCTIONED: {
        CASE_STATUS_DISBURSED,
        CASE_STATUS_WITHDRAWN,
    },
    CASE_STATUS_DISBURSED: {
        CASE_STATUS_PDD_PENDING,
        CASE_STATUS_PDD_COMPLETED,
        CASE_STATUS_CLOSED,
    },
    CASE_STATUS_PDD_PENDING: {
        CASE_STATUS_PDD_COMPLETED,
        CASE_STATUS_CLOSED,
    },
    CASE_STATUS_PDD_COMPLETED: {
        CASE_STATUS_CLOSED,
    },
    CASE_STATUS_CLOSED: set(),
    CASE_STATUS_REJECTED: {CASE_STATUS_LEAD},
    CASE_STATUS_WITHDRAWN: {CASE_STATUS_LEAD},
}


class InvalidStatusTransitionError(StateTransitionError):
    """Raised when an illegal case lifecycle transition is attempted."""

    def __init__(self, current_status: str, target_status: str) -> None:
        allowed = sorted(ALLOWED_STATUS_TRANSITIONS.get(current_status, set()))
        super().__init__(
            entity="case",
            from_status=current_status,
            to_status=target_status,
        )
        self.message = (
            f"Cannot transition case from '{current_status}' to '{target_status}'. "
            f"Allowed next states: {allowed}"
        )
        self.code = "INVALID_STATUS_TRANSITION"
        self.details = {
            "current_status": current_status,
            "target_status": target_status,
            "allowed_next_states": allowed,
        }


def validate_status_transition(
    current_status: str,
    target_status: str,
    user_role: str = "processor",
) -> None:
    """
    Validate that transition from current_status to target_status is permitted.
    Special rule: Reopening a rejected or withdrawn case requires manager or owner role.
    """
    if target_status not in ALL_CASE_STATUSES:
        raise BusinessRuleViolationError(f"Unknown target case status: '{target_status}'")

    if current_status == target_status:
        return  # No-op

    allowed = ALLOWED_STATUS_TRANSITIONS.get(current_status, set())
    if target_status not in allowed:
        raise InvalidStatusTransitionError(current_status, target_status)

    # Role constraint on re-opening closed/terminal cases
    if current_status in {CASE_STATUS_REJECTED, CASE_STATUS_WITHDRAWN}:
        if user_role not in {"owner", "manager"}:
            raise BusinessRuleViolationError(
                f"Re-opening a {current_status} case requires manager or owner role.",
                code="PRIVILEGE_REQUIRED",
            )
