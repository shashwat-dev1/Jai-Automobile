-- =============================================================================
-- DSA OS — PostgreSQL Database Initialization
-- Runs once when the PostgreSQL container is first created.
-- Creates application roles with least-privilege separation.
-- =============================================================================

-- Enable btree_gist extension (required for payout rule date-overlap constraints)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enable uuid-ossp for UUID generation (pgcrypto provides gen_random_uuid in PG16)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- Role: dsaos_app (application runtime role)
-- Cannot create tables or alter schema. Cannot bypass RLS.
-- This is the role used by the FastAPI application.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'dsaos_app') THEN
    CREATE ROLE dsaos_app WITH LOGIN PASSWORD 'dev_app_pg_password_change_me' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- =============================================================================
-- Role: dsaos_readonly (read-only role for backups, reporting, audits)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'dsaos_readonly') THEN
    CREATE ROLE dsaos_readonly WITH LOGIN PASSWORD 'dev_readonly_pg_password_change_me' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- The dsaos_migrator role (table owner) is already created as POSTGRES_USER
-- Grant CONNECT to application roles
GRANT CONNECT ON DATABASE dsaos TO dsaos_app;
GRANT CONNECT ON DATABASE dsaos TO dsaos_readonly;

-- Grant schema usage (will be expanded in migrations as tables are created)
GRANT USAGE ON SCHEMA public TO dsaos_app;
GRANT USAGE ON SCHEMA public TO dsaos_readonly;

-- =============================================================================
-- NOTE: Table-level GRANT and RLS policies are applied in Alembic migrations,
-- not here. This script only establishes the roles.
-- =============================================================================
