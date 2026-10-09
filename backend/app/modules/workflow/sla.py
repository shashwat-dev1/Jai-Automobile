"""
DSA OS — SLA Engine and Ageing Tracking
Calculates stage duration, threshold adherence, and stuck flag detection.
"""

from datetime import UTC, datetime
from typing import Any

# Standard turnaround benchmarks (in hours) per stage
DEFAULT_CASE_SLA_HOURS: dict[str, int] = {
    "lead": 24,
    "lead_qualified": 24,
    "docs_in_progress": 48,
    "docs_collected": 24,
    "file_logged_in": 48,
    "in_review_lender": 72,
    "queries_raised": 24,
    "sanctioned": 48,
    "disbursed": 24,
    "pdd_pending": 168,  # 7 days
}

DEFAULT_APPLICATION_SLA_HOURS: dict[str, int] = {
    "logged_in": 24,
    "under_verification": 48,
    "query_raised": 24,
    "sanctioned": 48,
    "accepted_by_customer": 48,
}


def compute_stage_sla(
    entered_stage_at: datetime | None,
    status: str,
    entity_type: str = "case",
    configured_sla_hours: int | None = None,
) -> dict[str, Any]:
    """
    Computes ageing hours, days, benchmark SLA and stuck status.
    """
    now = datetime.now(UTC)
    if entered_stage_at is None:
        entered_stage_at = now

    if entered_stage_at.tzinfo is None:
        entered_stage_at = entered_stage_at.replace(tzinfo=UTC)

    diff_seconds = max(0.0, (now - entered_stage_at).total_seconds())
    ageing_hours = diff_seconds / 3600.0

    if configured_sla_hours is not None and configured_sla_hours > 0:
        sla_hours = configured_sla_hours
    elif entity_type == "lender_application":
        sla_hours = DEFAULT_APPLICATION_SLA_HOURS.get(status, 48)
    else:
        sla_hours = DEFAULT_CASE_SLA_HOURS.get(status, 48)

    is_stuck = ageing_hours > sla_hours
    stuck_hours = max(0.0, ageing_hours - sla_hours)

    return {
        "entered_stage_at": entered_stage_at.isoformat(),
        "ageing_hours": round(ageing_hours, 1),
        "ageing_days": round(ageing_hours / 24.0, 1),
        "sla_hours": sla_hours,
        "is_stuck": is_stuck,
        "stuck_hours": round(stuck_hours, 1),
    }
