"""Create organizations table and database roles

Revision ID: 001
Revises: (none — initial migration)
Create Date: 2026-10-04

This is the initial migration that:
1. Creates the organizations table (platform-level, no RLS)
2. Grants schema and table privileges to dsaos_app role
3. Grants read-only privileges to dsaos_readonly role
4. Creates an initial seed organization for development

IMPORTANT:
- This migration runs as dsaos_migrator (table owner)
- dsaos_app is the application role (non-owner, cannot bypass RLS)
- dsaos_readonly is for backups and reporting
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # Create organizations table
    # Platform-level: no org_id FK, no RLS
    # -------------------------------------------------------------------------
    op.create_table(
        "organizations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("gstin", sa.String(15), nullable=True),
        sa.Column("pan", sa.String(10), nullable=True),
        sa.Column("plan", sa.String(50), nullable=False, server_default="pilot"),
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("region", sa.String(50), nullable=False, server_default="in-west-1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_organizations_slug"),
    )

    # Indexes
    op.create_index("ix_organizations_id", "organizations", ["id"], unique=False)
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)
    op.create_index("ix_organizations_is_active", "organizations", ["is_active"], unique=False)

    # -------------------------------------------------------------------------
    # Grant privileges to dsaos_app (application role)
    # dsaos_app: can SELECT, INSERT, UPDATE, DELETE on all tables
    # dsaos_app: can use sequences for primary key generation
    # -------------------------------------------------------------------------
    op.execute("GRANT USAGE ON SCHEMA public TO dsaos_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE organizations TO dsaos_app")
    op.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dsaos_app")

    # Ensure future tables and sequences are also accessible
    op.execute(
        "ALTER DEFAULT PRIVILEGES FOR ROLE dsaos_migrator IN SCHEMA public "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dsaos_app"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES FOR ROLE dsaos_migrator IN SCHEMA public "
        "GRANT USAGE, SELECT ON SEQUENCES TO dsaos_app"
    )

    # -------------------------------------------------------------------------
    # Grant privileges to dsaos_readonly (reporting / backup role)
    # -------------------------------------------------------------------------
    op.execute("GRANT USAGE ON SCHEMA public TO dsaos_readonly")
    op.execute("GRANT SELECT ON TABLE organizations TO dsaos_readonly")
    op.execute(
        "ALTER DEFAULT PRIVILEGES FOR ROLE dsaos_migrator IN SCHEMA public "
        "GRANT SELECT ON TABLES TO dsaos_readonly"
    )

    # -------------------------------------------------------------------------
    # Set updated_at trigger function (shared across all tables)
    # -------------------------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_organizations_updated_at
        BEFORE UPDATE ON organizations
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")
    op.drop_index("ix_organizations_is_active", table_name="organizations")
    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_index("ix_organizations_id", table_name="organizations")
    op.drop_table("organizations")
