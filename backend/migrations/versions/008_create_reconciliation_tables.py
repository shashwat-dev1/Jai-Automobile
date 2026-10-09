"""Create reconciliation tables with PostgreSQL RLS

Revision ID: 008
Revises: 007
Create Date: 2026-10-05

Implements Phase 07 database foundations:
1. import_batches table (tracks statement imports, dry-run vs committed, 24h reversal window)
2. statement_column_mappings table (saved column mappings per lender for reusable CSV/Excel parsing)
3. payout_receipts table (bank commission credits, TDS deductions, matching status)
4. reconciliations table (expectation-to-receipt match links, variance classification, tolerance)
5. clawback_events table (tracking post-disbursal clawbacks and early payoff recoveries)
6. PostgreSQL RLS policies with FORCE ROW LEVEL SECURITY
7. Table grants to dsaos_app and dsaos_readonly
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. import_batches table
    # -------------------------------------------------------------------------
    op.create_table(
        "import_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "lender_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lenders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("matched_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unmatched_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_received_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("status", sa.String(50), nullable=False, server_default="committed"),  # dry_run, committed, reversed
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversal_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index("ix_import_batches_org_id", "import_batches", ["org_id"])
    op.create_index("ix_import_batches_lender", "import_batches", ["org_id", "lender_id"])
    op.create_index("ix_import_batches_status", "import_batches", ["org_id", "status"])

    # -------------------------------------------------------------------------
    # 2. statement_column_mappings table
    # -------------------------------------------------------------------------
    op.create_table(
        "statement_column_mappings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "lender_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lenders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("mapping_name", sa.String(100), nullable=False, server_default="Default Format"),
        sa.Column("mappings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index("ix_statement_mappings_org_id", "statement_column_mappings", ["org_id"])
    op.create_index("ix_statement_mappings_lender", "statement_column_mappings", ["org_id", "lender_id"])

    # -------------------------------------------------------------------------
    # 3. payout_receipts table
    # -------------------------------------------------------------------------
    op.create_table(
        "payout_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "lender_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lenders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "import_batch_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("import_batches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("loan_account_no", sa.String(100), nullable=True),
        sa.Column("customer_name", sa.String(255), nullable=True),
        sa.Column("received_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("tds_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("net_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("utr_reference", sa.String(100), nullable=True),
        sa.Column("match_status", sa.String(50), nullable=False, server_default="unmatched"),  # unmatched, matched, partially_matched, clawback
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "lender_application_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lender_applications.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index("ix_payout_receipts_org_id", "payout_receipts", ["org_id"])
    op.create_index("ix_payout_receipts_lender", "payout_receipts", ["org_id", "lender_id"])
    op.create_index("ix_payout_receipts_lan", "payout_receipts", ["org_id", "loan_account_no"])
    op.create_index("ix_payout_receipts_match_status", "payout_receipts", ["org_id", "match_status"])

    # -------------------------------------------------------------------------
    # 4. reconciliations table
    # -------------------------------------------------------------------------
    op.create_table(
        "reconciliations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "expectation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payout_expectations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "receipt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payout_receipts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expected_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("received_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("variance_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),  # matched, short, excess, discrepancy
        sa.Column("tolerance_used", sa.Numeric(10, 2), nullable=False, server_default="10.00"),
        sa.Column("is_manual", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "reconciled_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "reconciled_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index("ix_reconciliations_org_id", "reconciliations", ["org_id"])
    op.create_index("ix_reconciliations_expectation", "reconciliations", ["org_id", "expectation_id"])
    op.create_index("ix_reconciliations_receipt", "reconciliations", ["org_id", "receipt_id"])
    op.create_index("ix_reconciliations_status", "reconciliations", ["org_id", "status"])

    # -------------------------------------------------------------------------
    # 5. clawback_events table
    # -------------------------------------------------------------------------
    op.create_table(
        "clawback_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lender_application_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lender_applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "expectation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payout_expectations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "receipt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payout_receipts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("clawback_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),  # pending, recovered, written_off
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index("ix_clawback_events_org_id", "clawback_events", ["org_id"])
    op.create_index("ix_clawback_events_case", "clawback_events", ["org_id", "case_id"])
    op.create_index("ix_clawback_events_status", "clawback_events", ["org_id", "status"])

    # -------------------------------------------------------------------------
    # 6. PostgreSQL RLS Policies
    # -------------------------------------------------------------------------
    for tbl in (
        "import_batches",
        "statement_column_mappings",
        "payout_receipts",
        "reconciliations",
        "clawback_events",
    ):
        op.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {tbl} FORCE ROW LEVEL SECURITY;")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation_policy ON {tbl}
            FOR ALL
            USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
            """
        )

    # -------------------------------------------------------------------------
    # 7. Table Permissions
    # -------------------------------------------------------------------------
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON import_batches, statement_column_mappings, payout_receipts, reconciliations, clawback_events TO dsaos_app;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_readonly') THEN
                GRANT SELECT ON import_batches, statement_column_mappings, payout_receipts, reconciliations, clawback_events TO dsaos_readonly;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("clawback_events")
    op.drop_table("reconciliations")
    op.drop_table("payout_receipts")
    op.drop_table("statement_column_mappings")
    op.drop_table("import_batches")
