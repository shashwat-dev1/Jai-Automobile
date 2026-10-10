# Phase 01 — Authentication, Tenancy and RBAC

## Objective

Implement user authentication (login, JWT, sessions), tenant isolation (application + ORM + PostgreSQL RLS), role-based access control, and the audit log foundation.

## Dependencies

- PH-00 (Foundation): database, app framework, migrations

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-AUTH-001 | Authentication by mobile/email + password; JWT tokens |
| FR-AUTH-002 | Enforce roles on every API call; 403 on denial |
| FR-AUTH-003 | Account lockout after 5 failed logins |
| FR-AUTH-005 | Owner creates/deactivates/re-roles users; deactivation ends sessions |
| FR-AUTH-006 | Session inactivity timeout; preserve unsaved data locally |
| FR-AUD-001 | Audit log with actor, role, action, entity, timestamps, IP |
| FR-AUD-002 | Audit records append-only for application roles |
| FR-AUD-003 | Owner/Auditor search and export audit log |
| NFR-SEC-002 | Tenant isolation via app code + PostgreSQL RLS; automated tests |
| NFR-SEC-003 | Passwords hashed with Argon2id; secrets in env |
| NFR-SEC-004 | Data at rest encryption; field-level encryption foundation |
| NFR-SEC-006 | Rate limiting, input validation, CSRF/XSS protections |
| BR-01 | Every business record carries org_id; no cross-org access |

## Database Changes

### New Tables
- `users` — with org_id, role, password_hash, lockout fields
- `refresh_tokens` — for session management
- `audit_log` — append-only, with trigger preventing UPDATE/DELETE
- `sla_configs` — placeholder for org-level configuration
- `status_transitions` — placeholder for workflow configuration

### RLS Setup
- Enable RLS on `users` table
- `FORCE ROW LEVEL SECURITY` on `users`
- Create tenant isolation policies for SELECT, INSERT, UPDATE, DELETE
- Grant DML to `dsaos_app` role (not table owner)
- Set up `app.current_org_id` session variable pattern

### Migrations
- `002_create_users.py`
- `003_create_refresh_tokens.py`
- `004_create_audit_log.py`
- `005_rls_policies.py`

## Backend Modules

### `app/modules/auth/`
- `router.py` — POST /auth/login, POST /auth/refresh, POST /auth/logout, GET /auth/me
- `service.py` — authenticate, issue_tokens, refresh, revoke, lockout logic
- `models.py` — User, RefreshToken SQLAlchemy models
- `schemas.py` — LoginRequest, TokenResponse, UserResponse
- `dependencies.py` — `get_current_user`, `require_permission`, `ensure_tenant_context`
- `security.py` — JWT encode/decode, password hash/verify, Fernet encryption utility

### `app/modules/tenancy/`
- `middleware.py` — Extract org_id from JWT, set in contextvars AND database session var
- `context.py` — ContextVar for current_org_id, current_user_id
- `rls.py` — SQLAlchemy event listener for auto-filtering and auto-setting org_id

### `app/modules/audit/`
- `router.py` — GET /audit, GET /audit/export
- `service.py` — log_event, search, export
- `models.py` — AuditLog model
- `schemas.py` — AuditEntry, AuditSearchParams

### `app/middleware/rate_limit.py`
- Redis-backed sliding window rate limiter
- Per-user, per-endpoint throttling

## API Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Authenticate, issue JWT pair | None |
| POST | `/api/v1/auth/refresh` | Rotate refresh token | Refresh token |
| POST | `/api/v1/auth/logout` | Revoke refresh token | Bearer JWT |
| GET | `/api/v1/auth/me` | Current user profile and permissions | Bearer JWT |
| GET | `/api/v1/users` | List users in organization | Owner |
| POST | `/api/v1/users` | Create user | Owner |
| PATCH | `/api/v1/users/{id}` | Update/deactivate user | Owner |
| GET | `/api/v1/audit` | Search audit log | Owner, Auditor |
| GET | `/api/v1/audit/export` | Export audit log CSV | Owner, Auditor |

## Frontend Routes/Components

- `/login` — Login page with email/mobile + password form
- Auth context provider (Zustand store: user, token, permissions)
- Protected route wrapper (redirects to login if unauthenticated)
- Permission hook: `usePermission('cases.read')`
- Token refresh interceptor in API client
- Session timeout warning modal (5 min before expiry)
- Draft preservation to localStorage on session expiry
- `/admin/users` — User list and management (Owner only)
- `/admin/audit` — Audit log viewer with filters (Owner, Auditor)

## Business Rules

- Passwords must meet minimum strength (8+ chars, mixed case, digit)
- Account lockout after 5 failed logins (configurable)
- Deactivated user's sessions revoked immediately
- Cannot deactivate self
- Audit records immutable by application

## Security Implications

**This is the most security-critical phase.** It establishes:
- The entire tenant isolation boundary
- The authentication mechanism
- The RBAC enforcement pattern
- The audit foundation

**Review Gate SECURITY-01** applies after this phase.

## Tests

### Authentication & Session Revocation Tests
- Login with valid credentials returns tokens containing auth_version
- Login with invalid credentials returns 401
- Login with locked account returns 423
- Account locks after 5 failures
- Account unlocks after 15 minutes
- Refresh token rotation works
- Expired access token rejected (401)
- Revoked refresh token rejected (401)
- Active user with matching auth_version → access succeeds
- User deactivated → auth_version incremented → subsequent request with active access token immediately denied (401)
- User role downgraded → auth_version incremented → subsequent request to privileged endpoint with active access token denied immediately
- Permissions changed → old authorization state cannot remain valid beyond revocation semantics
- Forced logout / session revocation increments auth_version → all existing access tokens rejected immediately

### RBAC Tests
- Each role tested against full permission matrix
- Field Executive cannot access payout endpoints (403)
- Processor cannot manage users (403)
- Auditor cannot modify any data (403)
- Accountant cannot change case status (403)
- Owner can access everything

### Tenant Isolation Tests (Critical)
- User A (Org A) cannot read Org B records → 404
- User A (Org A) cannot write to Org B records → 404
- Cross-tenant search returns zero results
- Manipulated org_id in request body ignored (JWT org_id used)
- Direct SQL query as `dsaos_app` without org context → zero rows
- `dsaos_app` cannot `SET ROLE dsaos_migrator` → denied
- `dsaos_app` cannot `ALTER TABLE` to disable RLS → denied
- `FORCE ROW LEVEL SECURITY` verified on all tenant tables
- Insert with wrong org_id → blocked by RLS WITH CHECK

### Audit Tests
- Login creates audit record
- Failed login creates audit record
- User creation creates audit record
- Audit records cannot be UPDATE'd by dsaos_app
- Audit records cannot be DELETE'd by dsaos_app
- Audit search returns filtered results
- Audit export generates valid CSV

### Rate Limiting Tests
- Login endpoint rate limited after 5 attempts
- API endpoints rate limited after threshold

## Acceptance Criteria

1. User can log in with email+password and receive JWT tokens
2. Protected endpoints return 401 without valid token
3. Each role can only access permitted resources (full matrix tested)
4. User from Org A cannot see or modify any Org B data (6+ test scenarios)
5. RLS policies active and enforced on all tenant-scoped tables
6. Audit log records all specified events and is immutable
7. Account lockout works after 5 failed logins
8. User deactivation immediately revokes all sessions
9. Rate limiting prevents brute-force attacks

## Definition of Done

- [ ] JWT authentication fully operational
- [ ] All 6 roles enforced on all endpoints
- [ ] PostgreSQL RLS policies on all tenant tables with FORCE ROW LEVEL SECURITY
- [ ] Tenant isolation test suite passes (all cross-tenant scenarios)
- [ ] RBAC test suite passes (full permission matrix)
- [ ] Audit log operational and append-only
- [ ] Rate limiting configured
- [ ] Frontend login flow working
- [ ] User management UI operational
- [ ] **Review Gate SECURITY-01 passed**

## Risks

- RLS misconfiguration could leak data across tenants → extensive testing required
- JWT secret management in development vs production
- Token refresh race conditions in concurrent browser tabs

## Files Expected to Change/Create

```
backend/
  app/modules/
    auth/
      __init__.py, router.py, service.py, models.py, schemas.py, dependencies.py, security.py
    tenancy/
      __init__.py, middleware.py, context.py, rls.py
    audit/
      __init__.py, router.py, service.py, models.py, schemas.py
  app/middleware/
    rate_limit.py
  migrations/versions/
    002_create_users.py
    003_create_refresh_tokens.py
    004_create_audit_log.py
    005_rls_policies.py
  tests/
    test_auth.py
    test_rbac.py
    test_tenant_isolation.py
    test_audit.py
    test_rate_limit.py
  seed/
    seed_orgs_and_users.py

frontend/src/
  features/auth/
    LoginPage.tsx
    AuthProvider.tsx
    useAuth.ts
    usePermission.ts
  features/admin/
    UsersPage.tsx
    AuditLogPage.tsx
  shared/hooks/
    useAuth.ts
  shared/lib/
    api.ts (updated with auth interceptor)
```
