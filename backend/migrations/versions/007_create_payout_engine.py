"""Create payout_rules, payout_expectations, and payout_splits with PostgreSQL RLS

Revision ID: 007
Revises: 006
Create Date: 2026-10-05

Implements Phase 06 database foundations:
1. payout_rules table (effective-dated commission grids, percentage/slab/flat, gating & TDS)
2. payout_expectations table (frozen historical rule snapshots, gross, TDS, net, held/due/no_rule status)
3. payout_splits table (dealer sub-DSA commission sharing with <= 100% invariant)
4. PostgreSQL RLS policies with FORCE ROW LEVEL SECURITY
5. Table grants to dsaos_app and dsaos_readonly
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. payout_rules table
    # -------------------------------------------------------------------------
    op.create_table(
        "payout_rules",
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
        sa.Column("product", sa.String(50), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("basis", sa.String(50), nullable=False, server_default="percent"),  # percent, slab, flat
        sa.Column("rate_percent", sa.Numeric(6, 3), nullable=True),
        sa.Column("flat_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("slabs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("conditions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("gating_type", sa.String(50), nullable=False, server_default="pdd_complete"),  # none, pdd_complete
        sa.Column("tds_rate_percent", sa.Numeric(5, 2), nullable=False, server_default="5.00"),
        sa.Column("gst_mode", sa.String(50), nullable=False, server_default="forward_charge"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
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

    op.create_index("ix_payout_rules_org_id", "payout_rules", ["org_id"])
    op.create_index("ix_payout_rules_lender_product", "payout_rules", ["org_id", "lender_id", "product"])
    op.create_index("ix_payout_rules_effective", "payout_rules", ["org_id", "effective_from", "effective_to"])

    # -------------------------------------------------------------------------
    # 2. payout_expectations table
    # -------------------------------------------------------------------------
    op.create_table(
        "payout_expectations",
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
            unique=True,
        ),
        sa.Column(
            "rule_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payout_rules.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("rule_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("disbursal_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("gross_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("tds_rate_percent", sa.Numeric(5, 2), nullable=False, server_default="5.00"),
        sa.Column("tds_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("net_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="held"),  # held, due, no_rule, paid, clawback
        sa.Column("gating_status", sa.String(50), nullable=False, server_default="pending"),  # pending, satisfied
        sa.Column("is_override", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("override_reason", sa.Text(), nullable=True),
        sa.Column("original_gross_amount", sa.Numeric(14, 2), nullable=True),
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

    op.create_index("ix_payout_expectations_org_id", "payout_expectations", ["org_id"])
    op.create_index("ix_payout_expectations_case_id", "payout_expectations", ["org_id", "case_id"])
    op.create_index("ix_payout_expectations_status", "payout_expectations", ["org_id", "status"])

    # -------------------------------------------------------------------------
    # 3. payout_splits table
    # -------------------------------------------------------------------------
    op.create_table(
        "payout_splits",
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
        sa.Column("beneficiary_type", sa.String(50), nullable=False),  # source, sales_agent, processor, company
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("share_type", sa.String(50), nullable=False, server_default="percent"),  # percent, flat
        sa.Column("share_value", sa.Numeric(10, 3), nullable=False),
        sa.Column("split_amount", sa.Numeric(14, 2), nullable=False),
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

    op.create_index("ix_payout_splits_expectation", "payout_splits", ["org_id", "expectation_id"])

    # -------------------------------------------------------------------------
    # 4. PostgreSQL RLS Policies
    # -------------------------------------------------------------------------
    for tbl in ("payout_rules", "payout_expectations", "payout_splits"):
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
    # 5. Table Permissions
    # -------------------------------------------------------------------------
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON payout_rules, payout_expectations, payout_splits TO dsaos_app;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_readonly') THEN
                GRANT SELECT ON payout_rules, payout_expectations, payout_splits TO dsaos_readonly;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("payout_splits")
    op.drop_table("payout_expectations")
    op.drop_table("payout_rules")
