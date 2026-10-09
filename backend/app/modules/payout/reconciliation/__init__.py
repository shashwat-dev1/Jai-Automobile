"""
DSA OS — Payout Reconciliation Module
Gate MONEY-01: Statement ingestion, auto-matching, variance classification, and clawbacks.
"""

from app.modules.payout.reconciliation.clawback_service import ClawbackService
from app.modules.payout.reconciliation.import_service import ReconciliationImportService
from app.modules.payout.reconciliation.matching_engine import (
    DEFAULT_TOLERANCE,
    VALID_RECEIPT_CASE_STATUSES,
    calculate_name_similarity,
    calculate_variance,
    classify_ageing,
    is_name_fuzzy_match,
    normalize_identifier,
)
from app.modules.payout.reconciliation.models import (
    ClawbackEvent,
    ImportBatch,
    PayoutReceipt,
    Reconciliation,
    StatementColumnMapping,
)
from app.modules.payout.reconciliation.receipt_service import PayoutReceiptService

__all__ = [
    "ClawbackEvent",
    "ClawbackService",
    "DEFAULT_TOLERANCE",
    "ImportBatch",
    "PayoutReceipt",
    "PayoutReceiptService",
    "Reconciliation",
    "ReconciliationImportService",
    "StatementColumnMapping",
    "VALID_RECEIPT_CASE_STATUSES",
    "calculate_name_similarity",
    "calculate_variance",
    "classify_ageing",
    "is_name_fuzzy_match",
    "normalize_identifier",
]
