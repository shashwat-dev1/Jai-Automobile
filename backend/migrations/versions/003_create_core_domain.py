"""Create core domain tables with PostgreSQL RLS

Revision ID: 003
Revises: 002
Create Date: 2026-10-05

Implements Phase 02 database foundations:
1. parties table (with encrypted PAN and masked Aadhaar)
2. sources table (dealers, sub-DSAs, connectors, direct)
3. cases table (with optimistic locking and unique case_no per org)
4. case_parties table (applicant, co-applicant, guarantor, seller)
5. vehicles table (vehicle details, prices, hypothecation)
6. consent_records table (DPDP compliance, party/purpose tracking)
7. case_status_history table (append-only lifecycle audit trail)
8. PostgreSQL RLS policies with FORCE ROW LEVEL SECURITY on all 7 tables
9. Table grants to dsaos_app and dsaos_readonly
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. parties table
    # -------------------------------------------------------------------------
    op.create_table(
        "parties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("mobile_primary", sa.String(15), nullable=False),
        sa.Column("mobile_secondary", sa.String(15), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("pan_encrypted", sa.String(512), nullable=True),
        sa.Column("pan_last_four", sa.String(4), nullable=True),
        sa.Column("aadhaar_last_four", sa.String(4), nullable=True),
        sa.Column("employment_type", sa.String(50), nullable=True, server_default="salaried"),
        sa.Column("dob", sa.Date(), nullable=True),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("address_line2", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("pincode", sa.String(10), nullable=True),
        sa.Column("monthly_income", sa.Numeric(12, 2), nullable=True),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_parties_org_mobile", "parties", ["org_id", "mobile_primary"])
    op.create_index("ix_parties_org_pan_last_four", "parties", ["org_id", "pan_last_four"])
    op.create_index("ix_parties_org_name", "parties", ["org_id", "name"])

    # -------------------------------------------------------------------------
    # 2. sources table
    # -------------------------------------------------------------------------
    op.create_table(
        "sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(50), nullable=False, server_default="dealer"),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("contact_person", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(15), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("payout_rate_default", sa.Numeric(5, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sources_org_name", "sources", ["org_id", "name"])
    op.create_index("ix_sources_org_type", "sources", ["org_id", "type"])

    # -------------------------------------------------------------------------
    # 3. cases table
    # -------------------------------------------------------------------------
    op.create_table(
        "cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("case_no", sa.String(50), nullable=False),
        sa.Column("product_type", sa.String(50), nullable=False, server_default="used_car"),
        sa.Column("status", sa.String(50), nullable=False, server_default="lead"),
        sa.Column("loan_amount_requested", sa.Numeric(14, 2), nullable=False),
        sa.Column("loan_amount_sanctioned", sa.Numeric(14, 2), nullable=True),
        sa.Column("loan_amount_disbursed", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sources.id"),
            nullable=False,
        ),
        sa.Column("source_executive", sa.String(255), nullable=True),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "assigned_processor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("org_id", "case_no", name="uq_cases_org_case_no"),
    )
    op.create_index("ix_cases_org_status", "cases", ["org_id", "status"])
    op.create_index("ix_cases_org_owner", "cases", ["org_id", "owner_id"])
    op.create_index("ix_cases_org_source", "cases", ["org_id", "source_id"])
    op.create_index("ix_cases_org_created_at", "cases", ["org_id", "created_at"])

    # -------------------------------------------------------------------------
    # 4. case_parties table
    # -------------------------------------------------------------------------
    op.create_table(
        "case_parties",
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
            "party_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("parties.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("role", sa.String(50), nullable=False, server_default="applicant"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("case_id", "party_id", "role", name="uq_case_party_role"),
    )
    op.create_index("ix_case_parties_org_case", "case_parties", ["org_id", "case_id"])
    op.create_index("ix_case_parties_org_party", "case_parties", ["org_id", "party_id"])

    # -------------------------------------------------------------------------
    # 5. vehicles table
    # -------------------------------------------------------------------------
    op.create_table(
        "vehicles",
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
            unique=True,
            nullable=False,
        ),
        sa.Column("vehicle_type", sa.String(50), nullable=False, server_default="four_wheeler"),
        sa.Column("make", sa.String(100), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("variant", sa.String(100), nullable=True),
        sa.Column("year_of_manufacture", sa.Integer(), nullable=True),
        sa.Column("condition", sa.String(20), nullable=False, server_default="used"),
        sa.Column("registration_no", sa.String(20), nullable=True),
        sa.Column("chassis_no", sa.String(50), nullable=True),
        sa.Column("engine_no", sa.String(50), nullable=True),
        sa.Column("valuation_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("ex_showroom_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("on_road_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("existing_hypothecation", sa.String(255), nullable=True),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_vehicles_registration_no", "vehicles", ["registration_no"])
    op.create_index("ix_vehicles_org_case", "vehicles", ["org_id", "case_id"])

    # -------------------------------------------------------------------------
    # 6. consent_records table
    # -------------------------------------------------------------------------
    op.create_table(
        "consent_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "party_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("parties.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("purpose", sa.String(100), nullable=False, server_default="loan_processing"),
        sa.Column("consent_type", sa.String(50), nullable=False, server_default="physical_form"),
        sa.Column("is_given", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "recorded_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_consent_party_purpose", "consent_records", ["party_id", "purpose"])
    op.create_index("ix_consent_org_party", "consent_records", ["org_id", "party_id"])

    # -------------------------------------------------------------------------
    # 7. case_status_history table
    # -------------------------------------------------------------------------
    op.create_table(
        "case_status_history",
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
        sa.Column("from_status", sa.String(50), nullable=True),
        sa.Column("to_status", sa.String(50), nullable=False),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column(
            "changed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_status_history_case_id", "case_status_history", ["case_id"])
    op.create_index("ix_status_history_org_case", "case_status_history", ["org_id", "case_id"])

    # -------------------------------------------------------------------------
    # 8. PostgreSQL RLS Policies with FORCE ROW LEVEL SECURITY
    # -------------------------------------------------------------------------
    tables = [
        "parties",
        "sources",
        "cases",
        "case_parties",
        "vehicles",
        "consent_records",
        "case_status_history",
    ]
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
        op.execute(f"""
            CREATE POLICY tenant_isolation_{table} ON {table}
            USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
            WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
        """)

    # -------------------------------------------------------------------------
    # 9. Role Grants
    # -------------------------------------------------------------------------
    for table in tables:
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dsaos_app') THEN
                    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {table} TO dsaos_app;
                END IF;
                IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dsaos_readonly') THEN
                    GRANT SELECT ON TABLE {table} TO dsaos_readonly;
                END IF;
            END $$;
        """)


def downgrade() -> None:
    tables = [
        "case_status_history",
        "consent_records",
        "vehicles",
        "case_parties",
        "cases",
        "sources",
        "parties",
    ]
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table};")
        op.drop_table(table)
