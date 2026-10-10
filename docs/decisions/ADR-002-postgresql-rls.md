# ADR-002: PostgreSQL Row-Level Security

**Status:** Accepted
**Date:** 2026-10-04

## Decision

Tenant isolation is enforced at three layers: application middleware, ORM auto-filtering, and PostgreSQL Row-Level Security (RLS) with `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables. The application connects as a non-owner role (`dsaos_app`) that cannot bypass RLS.

## Alternatives Considered

1. **Application-only filtering** — Add `WHERE org_id = ?` to all queries in application code
2. **Schema-per-tenant** — Separate PostgreSQL schemas per organization
3. **Database-per-tenant** — Separate databases per organization
4. **RLS with application-level defense-in-depth** — RLS + application filtering

## Rationale

- Application-only filtering is error-prone; a single missed filter leaks data across tenants
- Schema-per-tenant adds migration complexity and limits cross-tenant admin operations
- Database-per-tenant is operationally heavy for a pilot with potentially many small tenants
- RLS provides a database-level guarantee that no query can return cross-tenant data, even if application code has a bug
- `FORCE ROW LEVEL SECURITY` ensures even table owners cannot bypass policies
- Using a non-owner application role (`dsaos_app`) prevents RLS bypass through ownership
- Application-level filtering provides defense-in-depth but is not the sole protection

## Consequences

- Every tenant-scoped table requires RLS policies (SELECT, INSERT, UPDATE, DELETE)
- Migrations must be run as `dsaos_migrator` (table owner); application runs as `dsaos_app`
- `SET LOCAL app.current_org_id = '{uuid}'` must be called at the start of every transaction
- Queries without setting the org context return zero rows (safe default)
- Automated tests must verify RLS cannot be bypassed
- Small performance overhead from RLS policy evaluation (negligible for pilot scale)
