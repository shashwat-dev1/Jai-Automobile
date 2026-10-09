"""Create hardening tables with PostgreSQL RLS

Revision ID: 010
Revises: 009
Create Date: 2026-10-05

Implements Phase 10 hardening database foundations:
1. user_totp table (FR-AUTH-004 2FA secrets and recovery codes)
2. data_subject_requests table (FR-PRV-003 DSAR & consent withdrawal log)
3. breach_register table (FR-PRV-005 incident triage and reporting)
4. retention_schedules table (FR-PRV-004 legal hold and retention period)
5. data_import_batches table (FR-IMP-001..003 generic entity import with dry run and 24h reversal)
6. PostgreSQL RLS policies with FORCE ROW LEVEL SECURITY
7. Table grants to dsaos_app and dsaos_readonly
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. user_totp table (FR-AUTH-004)
    # -------------------------------------------------------------------------
    op.create_table(
        "user_totp",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("secret", sa.String(255), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "recovery_codes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("org_id", "user_id", name="uq_user_totp_org_user"),
    )
    op.create_index("ix_user_totp_user", "user_totp", ["org_id", "user_id"])

    # -------------------------------------------------------------------------
    # 2. data_subject_requests table (FR-PRV-003)
    # -------------------------------------------------------------------------
    op.create_table(
        "data_subject_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "party_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("parties.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("request_type", sa.String(50), nullable=False),  # access, correction, erasure, consent_withdrawal
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),  # pending, in_progress, completed, rejected
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("requested_by", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
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
    op.create_index("ix_dsar_org_party", "data_subject_requests", ["org_id", "party_id"])
    op.create_index("ix_dsar_status", "data_subject_requests", ["org_id", "status"])

    # -------------------------------------------------------------------------
    # 3. breach_register table (FR-PRV-005)
    # -------------------------------------------------------------------------
    op.create_table(
        "breach_register",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("incident_ref", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),  # low, medium, high, critical
        sa.Column("status", sa.String(50), nullable=False, server_default="reported"),  # reported, triaged, contained, resolved
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("triaged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("containment_steps", sa.Text(), nullable=True),
        sa.Column("affected_parties_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "reported_by",
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
    op.create_index("ix_breach_org_status", "breach_register", ["org_id", "status"])

    # -------------------------------------------------------------------------
    # 4. retention_schedules table (FR-PRV-004)
    # -------------------------------------------------------------------------
    op.create_table(
        "retention_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("retention_years", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("legal_hold", sa.Boolean(), nullable=False, server_default=sa.text("false")),
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
        sa.UniqueConstraint("org_id", "entity_type", name="uq_retention_org_entity"),
    )

    # -------------------------------------------------------------------------
    # 5. data_import_batches table (FR-IMP-001..003)
    # -------------------------------------------------------------------------
    op.create_table(
        "data_import_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(50), nullable=False),  # parties, cases, sources, lenders
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "errors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("status", sa.String(50), nullable=False, server_default="dry_run"),  # dry_run, committed, reversed
        sa.Column("can_reverse_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "imported_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
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
    op.create_index("ix_import_batch_org", "data_import_batches", ["org_id", "entity_type", "status"])

    # -------------------------------------------------------------------------
    # 6. PostgreSQL RLS Policies
    # -------------------------------------------------------------------------
    for tbl in (
        "user_totp",
        "data_subject_requests",
        "breach_register",
        "retention_schedules",
        "data_import_batches",
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
    # 7. Table Grants
    # -------------------------------------------------------------------------
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON user_totp, data_subject_requests, breach_register, retention_schedules, data_import_batches TO dsaos_app;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_readonly') THEN
                GRANT SELECT ON user_totp, data_subject_requests, breach_register, retention_schedules, data_import_batches TO dsaos_readonly;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("data_import_batches")
    op.drop_table("retention_schedules")
    op.drop_table("breach_register")
    op.drop_table("data_subject_requests")
    op.drop_table("user_totp")
