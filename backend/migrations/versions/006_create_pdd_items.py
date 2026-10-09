"""Create pdd_items table with PostgreSQL RLS for Post-Disbursal Documents tracking

Revision ID: 006
Revises: 005
Create Date: 2026-10-05

Implements Phase 05 database foundations:
1. pdd_items table (RC hypothecation, insurance clause, invoice, form 34)
2. PostgreSQL RLS policies with FORCE ROW LEVEL SECURITY
3. Table grants to dsaos_app and dsaos_readonly
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. pdd_items table
    # -------------------------------------------------------------------------
    op.create_table(
        "pdd_items",
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
        sa.Column("document_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_to_lender_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("lender_acknowledgement_ref", sa.String(100), nullable=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
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

    op.create_index("ix_pdd_items_org_id", "pdd_items", ["org_id"])
    op.create_index("ix_pdd_items_case_id", "pdd_items", ["org_id", "case_id"])
    op.create_index("ix_pdd_items_app_id", "pdd_items", ["org_id", "lender_application_id"])
    op.create_index("ix_pdd_items_status", "pdd_items", ["org_id", "status"])
    op.create_index("ix_pdd_items_due_date", "pdd_items", ["org_id", "due_date"])

    # -------------------------------------------------------------------------
    # 2. Row-Level Security (PostgreSQL RLS)
    # -------------------------------------------------------------------------
    op.execute("ALTER TABLE pdd_items ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE pdd_items FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation_policy ON pdd_items
        FOR ALL
        USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
        """
    )

    # -------------------------------------------------------------------------
    # 3. Table Permissions
    # -------------------------------------------------------------------------
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON pdd_items TO dsaos_app;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_readonly') THEN
                GRANT SELECT ON pdd_items TO dsaos_readonly;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("pdd_items")
