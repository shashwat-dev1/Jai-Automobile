"""
DSA OS — Payout Calculation Engine
Pure, deterministic financial calculation logic.
Invariants:
- Zero floating-point arithmetic; exact Decimal(14, 2) arithmetic with ROUND_HALF_UP
- BR-09: Sub-DSA / Executive splits validation (<= 100% total percent, <= gross total split amount)
- BR-13: Frozen rule terms snapshotting
"""

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.modules.payout.schemas import PayoutSplitItem
from app.shared.exceptions import BusinessRuleViolationError

TWOPLACES = Decimal("0.01")


def calculate_gross(
    disbursal_amount: Decimal,
    basis: str,
    rate_percent: Decimal | None = None,
    flat_amount: Decimal | None = None,
    slabs: list[dict[str, Any]] | None = None,
) -> Decimal:
    """
    Computes gross payout receivable from lender for a given disbursal.
    Supported basis:
    - percent: rate_percent % of disbursal_amount
    - flat: fixed flat_amount
    - slab: tiered brackets by disbursal ticket size
    """
    if basis == "percent":
        if rate_percent is None:
            raise BusinessRuleViolationError(
                "rate_percent is required for percent-basis payout rule.",
                code="PAYOUT_RULE_INVALID",
            )
        return (disbursal_amount * rate_percent / Decimal("100")).quantize(
            TWOPLACES, rounding=ROUND_HALF_UP
        )

    if basis == "flat":
        if flat_amount is None:
            raise BusinessRuleViolationError(
                "flat_amount is required for flat-basis payout rule.",
                code="PAYOUT_RULE_INVALID",
            )
        return flat_amount.quantize(TWOPLACES, rounding=ROUND_HALF_UP)

    if basis == "slab":
        if not slabs:
            raise BusinessRuleViolationError(
                "slabs list is required for slab-basis payout rule.",
                code="PAYOUT_RULE_INVALID",
            )

        for slab in slabs:
            min_val = Decimal(str(slab.get("min_amount", 0)))
            max_val = (
                Decimal(str(slab["max_amount"]))
                if slab.get("max_amount") is not None
                else None
            )

            # Ticket size falls into bracket [min, max]
            if disbursal_amount >= min_val and (max_val is None or disbursal_amount <= max_val):
                if slab.get("rate_percent") is not None:
                    pct = Decimal(str(slab["rate_percent"]))
                    return (disbursal_amount * pct / Decimal("100")).quantize(
                        TWOPLACES, rounding=ROUND_HALF_UP
                    )
                if slab.get("flat_amount") is not None:
                    flat = Decimal(str(slab["flat_amount"]))
                    return flat.quantize(TWOPLACES, rounding=ROUND_HALF_UP)

        # Fallback if no slab matched
        return Decimal("0.00")

    raise BusinessRuleViolationError(f"Unsupported payout basis: '{basis}'", code="PAYOUT_BASIS_UNSUPPORTED")


def calculate_tds(gross_amount: Decimal, tds_rate_percent: Decimal) -> Decimal:
    """Computes statutory TDS deduction on commission income (default 5%)."""
    return (gross_amount * tds_rate_percent / Decimal("100")).quantize(
        TWOPLACES, rounding=ROUND_HALF_UP
    )


def calculate_net(gross_amount: Decimal, tds_amount: Decimal) -> Decimal:
    """Net payout expected from bank after TDS deduction."""
    return (gross_amount - tds_amount).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def validate_and_compute_splits(
    gross_amount: Decimal,
    splits: list[PayoutSplitItem],
) -> list[tuple[PayoutSplitItem, Decimal]]:
    """
    Validates BR-09:
    1. Total percentage share of splits must never exceed 100%.
    2. Total allocated split amount must not exceed gross expectation.
    Returns list of (split_item, computed_split_amount).
    """
    total_percent = Decimal("0.000")
    total_split_amount = Decimal("0.00")
    results: list[tuple[PayoutSplitItem, Decimal]] = []

    for item in splits:
        if item.share_type == "percent":
            total_percent += item.share_value
            amt = (gross_amount * item.share_value / Decimal("100")).quantize(
                TWOPLACES, rounding=ROUND_HALF_UP
            )
        elif item.share_type == "flat":
            amt = item.share_value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)
        else:
            raise BusinessRuleViolationError(
                f"Unsupported split share_type: '{item.share_type}'",
                code="SPLIT_TYPE_UNSUPPORTED",
            )

        total_split_amount += amt
        results.append((item, amt))

    if total_percent > Decimal("100.000"):
        raise BusinessRuleViolationError(
            f"BR-09: Total percentage splits ({total_percent}%) exceed 100.000%.",
            code="SPLIT_PERCENT_EXCEEDED",
        )

    if total_split_amount > gross_amount:
        raise BusinessRuleViolationError(
            f"BR-09: Total allocated split amounts (₹{total_split_amount}) exceed gross amount (₹{gross_amount}).",
            code="SPLIT_AMOUNT_EXCEEDED",
        )

    return results
