"""Sync missing TenantModel columns (deleted_at, version) across domain tables

Revision ID: 011
Revises: 010
Create Date: 2026-10-05

Aligns all tables inheriting from TenantModel with the expected schema:
- deleted_at: DateTime(timezone=True), nullable=True
- version: Integer, nullable=False, server_default="1"
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Tables missing version (Integer, default 1)
    tables_needing_version = [
        "sources",
        "lenders",
        "vehicles",
        "case_parties",
        "case_status_history",
        "consent_records",
        "payout_splits",
        "import_batches",
        "statement_column_mappings",
        "reconciliations",
        "clawback_events",
    ]
    for tbl in tables_needing_version:
        op.add_column(
            tbl,
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        )

    # 2. Tables missing deleted_at (DateTime(timezone=True), nullable=True)
    tables_needing_deleted_at = [
        "pdd_items",
        "payout_rules",
        "payout_expectations",
        "payout_splits",
        "import_batches",
        "statement_column_mappings",
        "payout_receipts",
        "reconciliations",
        "clawback_events",
    ]
    for tbl in tables_needing_deleted_at:
        op.add_column(
            tbl,
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    tables_needing_version = [
        "sources",
        "lenders",
        "vehicles",
        "case_parties",
        "case_status_history",
        "consent_records",
        "payout_splits",
        "import_batches",
        "statement_column_mappings",
        "reconciliations",
        "clawback_events",
    ]
    for tbl in tables_needing_version:
        op.drop_column(tbl, "version")

    tables_needing_deleted_at = [
        "pdd_items",
        "payout_rules",
        "payout_expectations",
        "payout_splits",
        "import_batches",
        "statement_column_mappings",
        "payout_receipts",
        "reconciliations",
        "clawback_events",
    ]
    for tbl in tables_needing_deleted_at:
        op.drop_column(tbl, "deleted_at")
