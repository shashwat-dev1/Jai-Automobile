"""
DSA OS — Payout Reconciliation Matching Engine
Pure deterministic matching, variance calculation, and ageing classification.
Zero floating-point arithmetic: pure Decimal throughout.
"""

import re
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Final

# Tolerance default in INR
DEFAULT_TOLERANCE: Final[Decimal] = Decimal("10.00")
FUZZY_NAME_THRESHOLD: Final[float] = 0.85

# BR-07: Valid case statuses for payout receipt linkage
VALID_RECEIPT_CASE_STATUSES: Final[set[str]] = {
    "disbursed",
    "pdd_pending",
    "pdd_completed",
    "closed",
}


def normalize_identifier(val: str | None) -> str:
    """Normalize loan account number or reference (strip spaces, symbols, uppercase)."""
    if not val:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", val).upper()


def normalize_name(name: str | None) -> str:
    """Normalize personal/business name for similarity comparison."""
    if not name:
        return ""
    # Remove honorifics and punctuation
    cleaned = re.sub(r"\b(mr|mrs|ms|shri|smt|dr|m/s)\b\.?", "", name, flags=re.IGNORECASE)
    cleaned = re.sub(r"[^A-Za-z0-9\s]", " ", cleaned)
    return " ".join(cleaned.lower().split())


def calculate_name_similarity(name1: str | None, name2: str | None) -> float:
    """
    Compute string similarity between two names using SequenceMatcher.
    Returns float between 0.0 and 1.0.
    """
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    if not n1 or not n2:
        return 0.0
    if n1 == n2:
        return 1.0

    # Direct sequence matcher
    ratio = SequenceMatcher(None, n1, n2).ratio()

    # Also check token sorted ratio for inverted names (e.g. 'Sharma Rahul' vs 'Rahul Sharma')
    tokens1 = " ".join(sorted(n1.split()))
    tokens2 = " ".join(sorted(n2.split()))
    token_ratio = SequenceMatcher(None, tokens1, tokens2).ratio()

    return max(ratio, token_ratio)


def is_name_fuzzy_match(name1: str | None, name2: str | None, threshold: float = FUZZY_NAME_THRESHOLD) -> bool:
    """Returns True if normalized similarity exceeds threshold (default 85%)."""
    return calculate_name_similarity(name1, name2) >= threshold


def calculate_variance(
    received_amount: Decimal,
    expected_amount: Decimal,
    tolerance: Decimal = DEFAULT_TOLERANCE,
) -> tuple[Decimal, str]:
    """
    Compute signed variance and match status classification.
    Variance = received_amount - expected_amount.

    Classification:
    - 'matched': abs(variance) <= tolerance
    - 'short': variance < -tolerance (underpayment)
    - 'excess': variance > tolerance (overpayment)
    """
    variance = received_amount - expected_amount
    abs_var = abs(variance)

    if abs_var <= tolerance:
        status = "matched"
    elif variance < Decimal("0.00"):
        status = "short"
    else:
        status = "excess"

    return variance, status


def classify_ageing(reference_date: date, as_of: date | None = None) -> str:
    """
    Classify ageing bucket for overdue/outstanding receivables.
    Buckets: '0_30', '31_60', '61_90', '90_plus'
    """
    if as_of is None:
        as_of = date.today()

    days = (as_of - reference_date).days
    if days <= 30:
        return "0_30"
    elif days <= 60:
        return "31_60"
    elif days <= 90:
        return "61_90"
    else:
        return "90_plus"
