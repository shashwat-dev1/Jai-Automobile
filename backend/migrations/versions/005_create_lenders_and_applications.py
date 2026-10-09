"""Create lenders, lender_applications, tasks, and sla_configs with PostgreSQL RLS

Revision ID: 005
Revises: 004
Create Date: 2026-10-05

Implements Phase 04 database foundations:
1. lenders table (per-org or platform lender partners)
2. lender_applications table (multi-lender submissions per case, sanction terms, disbursal, partial unique winning constraint)
3. tasks table (follow-up tasks, call reminders, document pickups)
4. sla_configs table (configurable stage turnaround SLA in hours)
5. Add entered_stage_at column to cases table for SLA ageing
6. PostgreSQL RLS policies with FORCE ROW LEVEL SECURITY
7. Table grants to dsaos_app and dsaos_readonly
8. Seed standard Indian lenders and default stage SLA configurations
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. lenders table
    # -------------------------------------------------------------------------
    op.create_table(
        "lenders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("type", sa.String(50), nullable=False, server_default="bank"),  # bank, nbfc, sfb, hfc
        sa.Column(
            "products",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("dsa_code", sa.String(100), nullable=True),
        sa.Column("contact_person", sa.String(255), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("contact_mobile", sa.String(15), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_lenders_org_name", "lenders", ["org_id", "name"], unique=True)
    op.create_index("ix_lenders_org_active", "lenders", ["org_id", "is_active"])

    # -------------------------------------------------------------------------
    # 2. lender_applications table
    # -------------------------------------------------------------------------
    op.create_table(
        "lender_applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lender_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lenders.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("product", sa.String(50), nullable=False),
        sa.Column("login_ref", sa.String(100), nullable=True),
        sa.Column("login_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="logged_in",
        ),
        sa.Column("query_notes", sa.Text(), nullable=True),
        sa.Column("sanction_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("sanction_tenure_months", sa.Integer(), nullable=True),
        sa.Column("sanction_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("sanction_margin_money", sa.Numeric(14, 2), nullable=True),
        sa.Column("sanction_date", sa.Date(), nullable=True),
        sa.Column("rejection_reason_code", sa.String(100), nullable=True),
        sa.Column("rejection_notes", sa.Text(), nullable=True),
        sa.Column("disbursal_date", sa.Date(), nullable=True),
        sa.Column("disbursal_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("disbursal_ref", sa.String(100), nullable=True),
        sa.Column("disbursal_override_reason", sa.Text(), nullable=True),
        sa.Column("is_winning", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "entered_stage_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_lender_applications_org_case", "lender_applications", ["org_id", "case_id"])
    op.create_index("ix_lender_applications_org_lender", "lender_applications", ["org_id", "lender_id"])
    op.create_index("ix_lender_applications_org_status", "lender_applications", ["org_id", "status"])

    # Partial Unique Index enforcing BR-05: Exactly at most ONE winning application per case
    op.execute(
        """
        CREATE UNIQUE INDEX uq_one_winning_per_case
        ON lender_applications (org_id, case_id)
        WHERE is_winning = true;
        """
    )

    # -------------------------------------------------------------------------
    # 3. tasks (follow-ups) table
    # -------------------------------------------------------------------------
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "lender_application_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lender_applications.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("type", sa.String(50), nullable=False, server_default="other"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_tasks_org_owner_status", "tasks", ["org_id", "owner_id", "status"])
    op.create_index("ix_tasks_org_due_date", "tasks", ["org_id", "due_date"])
    op.create_index("ix_tasks_org_case", "tasks", ["org_id", "case_id"])

    # -------------------------------------------------------------------------
    # 4. sla_configs table
    # -------------------------------------------------------------------------
    op.create_table(
        "sla_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(50), nullable=False),  # case, lender_application
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("sla_hours", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_sla_configs_org_entity_status", "sla_configs", ["org_id", "entity_type", "status"], unique=True)

    # -------------------------------------------------------------------------
    # 5. Add entered_stage_at to cases table
    # -------------------------------------------------------------------------
    op.add_column(
        "cases",
        sa.Column(
            "entered_stage_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # -------------------------------------------------------------------------
    # 6. PostgreSQL RLS Policies
    # -------------------------------------------------------------------------
    for table_name in ["lenders", "lender_applications", "tasks", "sla_configs"]:
        op.execute(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation_policy ON {table_name}
            FOR ALL
            USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
            WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
            """
        )

    # -------------------------------------------------------------------------
    # 7. Database Role Grants
    # -------------------------------------------------------------------------
    for role_stmt in [
        "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dsaos_app') THEN "
        "GRANT ALL ON lenders, lender_applications, tasks, sla_configs TO dsaos_app; END IF; END $$;",
        "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dsaos_readonly') THEN "
        "GRANT SELECT ON lenders, lender_applications, tasks, sla_configs TO dsaos_readonly; END IF; END $$;",
    ]:
        op.execute(role_stmt)


def downgrade() -> None:
    op.drop_column("cases", "entered_stage_at")
    op.drop_table("sla_configs")
    op.drop_table("tasks")
    op.drop_table("lender_applications")
    op.drop_table("lenders")
