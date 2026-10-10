# DSA OS — Security Plan

> This document defines the security architecture, controls, and test plan for DSA OS.
> Security is a first-class requirement per AGENTS.md and SRS Section 3.6.1.

---

## 1. Authentication

### 1.1 Mechanism

- **JWT-based** with short-lived access tokens (15 min) and rotated refresh tokens (7 days)
- Credentials: email/mobile + password
- Password hashing: **Argon2id** via passlib (memory=65536, time=3, parallelism=4)
- TOTP 2FA (P1): mandatory for Owner and Accountant; optional for others

### 1.2 Token Security

- Access token: signed with **RS256** (asymmetric, no algorithm negotiation), contains `user_id`, `org_id`, `role`, `auth_version`
- Refresh token: opaque, stored hashed in DB, single-use (rotation on each refresh)
- Tokens never stored in localStorage; httpOnly cookies or in-memory storage with refresh
- CSRF protection via SameSite=Strict cookies or double-submit pattern

### 1.3 Immediate Revocation via `auth_version`

The SRS requires that user deactivation ends all sessions immediately (FR-AUTH-005). A short-lived JWT alone does not satisfy this — a deactivated user could retain access for up to 15 minutes until token expiry.

**Mechanism — `auth_version` column on `users` table:**

1. The `users` table carries an `auth_version INTEGER NOT NULL DEFAULT 1` column
2. When issuing an access token, the current `auth_version` is embedded in the JWT claims
3. On every authenticated request, the middleware compares the JWT's `auth_version` against the user's current `auth_version` in the database (cached in Redis with short TTL of 30 seconds)
4. If mismatched: the request is denied with 401 and the reason `session_invalidated`
5. `auth_version` is incremented when:
   - User is deactivated
   - User's role is changed
   - All sessions are force-revoked by Owner
   - Password is changed
6. All existing refresh tokens are also revoked when `auth_version` is incremented

**Performance note:** The `auth_version` lookup is cached in Redis (`user:{id}:auth_version`) with a 30-second TTL. This means worst-case revocation latency is 30 seconds, not 15 minutes. The cache is explicitly invalidated (deleted) on `auth_version` increment, so the next request triggers a fresh DB lookup.

**Fail-closed behavior:** If the Redis cache is unavailable or the `auth_version` DB lookup fails for any reason, the middleware MUST reject the request with 401. The system never falls back to trusting the JWT claim alone.

### 1.4 Account Lockout

- 5 failed logins within 15 minutes triggers lockout
- Lockout duration: 15 minutes (configurable)
- All lockout events logged to audit
- Progressive delays before lockout (100ms, 200ms, 400ms, 800ms, 1600ms)

### 1.5 Session Management

- Active sessions tracked in `refresh_tokens` table (no separate `active_sessions` table)
- User deactivation by Owner revokes ALL sessions immediately (via `auth_version` increment)
- Inactivity timeout: 30 minutes (configurable per org)
- Maximum concurrent sessions: configurable (default: 5)

---

## 2. Role-Based Access Control (RBAC)

### 2.1 Role Matrix

From SRS Appendix B:

| Capability | Owner | Manager | Processor | Field Exec | Accountant | Auditor |
|---|---|---|---|---|---|---|
| Create party/case | Y | Y | Y | Y | - | - |
| View cases | All | All | All | Own | Read | Read |
| Edit case/application | Y | Y | Y | Own | - | - |
| Change case status | Y | Y | Y | Limited | - | - |
| Upload documents | Y | Y | Y | Own | - | - |
| View/download documents | Y | Y | Y | Own | - | Read (logged) |
| Archive document | Y | Y | - | - | - | - |
| Reveal masked fields | Y | Y | - | - | Y | - |
| View payout | Y | Optional | - | - | Y | Read |
| Edit payout rules | Y | - | - | - | Y (reason) | - |
| Import/reconcile | Y | - | - | - | Y | - |
| Manage sources | Y | Y | - | - | Y | - |
| View team performance | Y | Y | - | Own | - | Read |
| Export data | Y | Y | - | - | Y | - |
| Manage users/roles | Y | - | - | - | - | - |
| View audit log | Y | - | - | - | - | Y |

### 2.2 Enforcement

- **Every API endpoint** checks permissions via a FastAPI dependency
- Permissions are extracted from the JWT and validated against a permission map
- Field Executive scope filtering is enforced in the service layer AND by database queries
- No client-side-only access control; all checks happen server-side

### 2.3 Permission Implementation

```python
# Permission check as FastAPI dependency
class PermissionChecker:
    def __init__(self, required: str, scope: str = "all"):
        self.required = required
        self.scope = scope

    async def __call__(self, user: User = Depends(get_current_user)):
        if not has_permission(user.role, self.required):
            raise HTTPException(403)
        if self.scope == "own" and user.role == "field_executive":
            # Filter will be applied in query
            pass
```

---

## 3. Tenant Isolation

### 3.1 Three-Layer Defense

**Layer 1 — Application Middleware:**
- JWT middleware extracts `org_id`
- Stored in `contextvars.ContextVar` for request lifetime
- All service methods receive tenant context implicitly

**Layer 2 — ORM Layer:**
- SQLAlchemy session event listener auto-appends `WHERE org_id = :current_org` on all queries
- Auto-sets `org_id` on all INSERT operations
- Prevents accidental cross-tenant queries at the code level

**Layer 3 — Database RLS:**
- PostgreSQL RLS policies on EVERY tenant-scoped table
- `FORCE ROW LEVEL SECURITY` on all tenant tables
- Application connects as `dsaos_app` role (NOT the table owner)
- `dsaos_app` sets `app.current_org_id` via `SET LOCAL` at transaction start

### 3.2 RLS Policy Template

```sql
-- Table creation by dsaos_migrator (table owner)
CREATE TABLE cases (...);

-- Enable RLS
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases FORCE ROW LEVEL SECURITY;

-- Policy: tenant can only see/modify own data
CREATE POLICY tenant_isolation_select ON cases
    FOR SELECT
    USING (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_insert ON cases
    FOR INSERT
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_update ON cases
    FOR UPDATE
    USING (org_id = current_setting('app.current_org_id')::uuid)
    WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY tenant_isolation_delete ON cases
    FOR DELETE
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- Application role gets DML only, not ownership
GRANT SELECT, INSERT, UPDATE, DELETE ON cases TO dsaos_app;
```

### 3.3 Database Roles

| Role | Purpose | Capabilities |
|---|---|---|
| `dsaos_migrator` | Schema owner, runs migrations | CREATE, ALTER, DROP tables; create policies |
| `dsaos_app` | Application runtime | SELECT, INSERT, UPDATE, DELETE on granted tables; CANNOT bypass RLS |
| `dsaos_readonly` | Backup and monitoring | SELECT only |

---

## 4. Object Storage Security

### 4.1 Access Control

- All buckets are **private** — no public access policies
- **Canonical documents** accessible ONLY through server-generated signed URLs
- **Quarantined/unvalidated objects** are NEVER accessible through download APIs
- Signed URL expiry: **5 minutes maximum** (NFR-SEC-005)
- URL generation requires: authenticated request + permission check + document status check (must be `received` or later) + audit log

### 4.2 Upload Security (Quarantine Model)

- Pre-signed PUT URLs for direct upload target the **quarantine zone only**
- **Allowed types**: PDF, JPG, PNG only (FR-DOC-002)
- **Max size**: 15 MB per file (configurable)
- **Quarantine-to-canonical validation pipeline** (runs in background worker):
  1. **Content-type verification** (check magic bytes, not just extension)
  2. **File size re-verification** (guard against pre-signed URL bypass)
  3. **Malware scan** via ClamAV
  4. **EXIF metadata stripping** (NFR-SEC-007)
  5. **Filename sanitization** (remove special characters, limit length)
- **If validation passes**: cleaned file copied to canonical zone; quarantine object deleted; document status → `received`
- **If validation fails**: quarantine object deleted; document status → `validation_failed`; audit record created with failure reason; user notified with safe error message (no file content leaked)

### 4.3 Storage Structure

```
quarantine/
  {org_id}/
    {upload_id}/
      {sanitized_filename}

documents/
  {org_id}/
    {document_id}/
      v{version}/
        {sanitized_filename}
```

- Bucket-level server-side encryption (SSE-S3) on both zones
- Cross-org access is impossible because the storage key includes `org_id`
- Quarantine zone objects are never served to users; only the worker reads them
- Abandoned quarantine objects (no confirm within 24h) cleaned up by scheduled job

### 4.4 Quarantine Security Invariants

1. A document with `file_key` pointing to quarantine prefix MUST NOT generate a signed download URL
2. The download API MUST check `document.status NOT IN ('pending_upload', 'pending_validation', 'validation_failed')` before generating any URL
3. Failed scans create an audit record of type `document.validation_failed` with the scan result (not the file content)
4. Promotion from quarantine to canonical is the ONLY path for a file to become downloadable

---

## 5. Sensitive Data Handling

### 5.1 Field-Level Encryption

| Field | Storage | Algorithm | Key Management |
|---|---|---|---|
| PAN | `pan_encrypted` (BYTEA) | AES-256 via Fernet | Environment-managed key |
| Bank account | Encrypted column | AES-256 via Fernet | Environment-managed key |
| TOTP secret | Encrypted column | AES-256 via Fernet | Environment-managed key |

- `pan_last_four` stored separately for search/dedup (not encrypted)
- Aadhaar: **last 4 digits only** stored; full number NEVER stored (LEG-005)

### 5.2 Masked API Responses

Default API responses mask sensitive fields. Reveal requires explicit action + audit:

```json
{
  "pan": "XXXX-XXXX-1234",
  "mobile": "XXXXX-XX890",
  "bank_account": "XXXXXXXXXXXX4567"
}
```

- Reveal endpoint: `POST /parties/{id}/reveal`
- Only Owner, Manager, Accountant can reveal
- Every reveal creates an audit record

### 5.3 Audit Log Redaction

When storing before/after states in audit records:
- PAN, bank account, Aadhaar → hashed (SHA-256) before storage
- Passwords, TOTP secrets → never included
- Amounts → stored as-is (financial transparency required)

---

## 6. Input Validation and Protection

### 6.1 Input Validation

- **Pydantic v2** validates all API inputs with strict types
- SQL injection: prevented by parameterized queries (SQLAlchemy)
- XSS: output encoding via Pydantic serialization; React auto-escapes
- Path traversal: file keys validated against allowed patterns
- Registration number format validation (Indian format)
- Mobile number format validation (Indian 10-digit)
- PAN format validation (5 alpha + 4 digit + 1 alpha)

### 6.2 Rate Limiting

| Endpoint Category | Limit | Window |
|---|---|---|
| Login | 5 attempts | 15 minutes |
| API (authenticated) | 100 requests | 1 minute |
| Upload | 10 files | 5 minutes |
| Export | 5 requests | 15 minutes |
| Password reset | 3 attempts | 1 hour |

Implemented via Redis-backed sliding window counters.

### 6.3 CSRF Protection

- SameSite=Strict on auth cookies
- Custom header check (`X-Requested-With`) on mutation endpoints
- Origin validation

### 6.4 Security Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 7. Audit Security

### 7.1 Append-Only Enforcement

```sql
-- Application role can only INSERT and SELECT audit records
GRANT INSERT, SELECT ON audit_log TO dsaos_app;
-- No UPDATE or DELETE granted

-- Trigger to prevent modification attempts
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records cannot be modified';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_audit_update
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();
```

### 7.2 Always-Audited Actions

Per SRS Appendix D:
- Logins (success and failure), lockouts, 2FA events
- Status changes and overrides
- Document upload, view, download, replace, archive, restore
- Party, case, vehicle, source edits
- Payout rule changes, expectations, receipts, reconciliation, clawbacks, splits
- Masked field reveals
- Exports and imports
- User, role, permission changes
- Consent capture/withdrawal, DSAR, deletions

---

## 8. Data Protection

### 8.1 Encryption at Rest

| Component | Method |
|---|---|
| PostgreSQL | Volume-level encryption (managed provider) |
| MinIO/S3 | Server-side encryption (SSE-S3) |
| Backups | Encrypted before storage |
| Sensitive fields | Field-level AES-256 |

### 8.2 Encryption in Transit

- TLS 1.2+ on all client-server connections
- HSTS enabled with 1-year max-age
- Internal service communication over TLS (in production)
- Database connections over SSL

### 8.3 Key Management

- Encryption keys stored in environment variables or secret manager
- Key rotation plan: quarterly rotation with re-encryption job
- Separate keys for: field encryption, JWT signing, TOTP encryption
- Keys never committed to source control

---

## 9. Backup Security

- Database: daily automated pg_dump, encrypted, stored separately
- Object storage: replication or daily sync to separate location
- Backup access: `dsaos_readonly` role only
- Backup restoration tested monthly
- RPO: 24 hours; RTO: 8 hours (for pilot)

---

## 10. Security Test Plan

### 10.1 Automated Tests (Run in CI)

#### SECURITY-TEST-001: Cross-Tenant Access Fails

```
Given: User A in Organization A, User B in Organization B
When: User A requests any record belonging to Organization B by direct ID
Then: Response is 404 (not 403, to prevent ID enumeration)
And: No data from Organization B is returned
```

Test cases:
- GET case by ID (cross-tenant)
- GET party by ID (cross-tenant)
- GET document by ID (cross-tenant)
- PATCH case by ID (cross-tenant)
- Cross-tenant search returns zero results
- Cross-tenant via manipulated org_id in request body

#### SECURITY-TEST-002: Unauthorized Role Action Fails

```
Given: User with role Field Executive
When: User attempts to access payout data via API
Then: Response is 403
And: No payout data is returned
```

Test cases:
- Field Executive accessing payout rules → 403
- Field Executive accessing reconciliation → 403
- Processor managing users → 403
- Auditor modifying data → 403
- Accountant changing case status → 403
- Each role tested against the full permission matrix

#### SECURITY-TEST-003: Unauthorized Document Access Fails

```
Given: User without document access permission for a case
When: User requests document download URL
Then: Response is 403
And: No signed URL is generated
```

Test cases:
- Field Executive accessing another user's case documents → 403
- Accountant downloading documents → 403
- Direct S3 URL access without valid signature → 403
- Expired signed URL → 403

#### SECURITY-TEST-004: RLS Cannot Be Bypassed

```
Given: Application connects as dsaos_app role
When: A query is executed without setting app.current_org_id
Then: Zero rows are returned (not an error, not all rows)

Given: dsaos_app role attempts to bypass RLS
When: Using SET ROLE, ALTER TABLE, or GRANT commands
Then: Operation fails with permission denied
```

Test cases:
- Query without setting org context → empty result
- Attempt to SET ROLE to migrator → denied
- Attempt to ALTER TABLE to disable RLS → denied
- Attempt to DROP POLICY → denied
- FORCE ROW LEVEL SECURITY verified on every tenant table
- Direct SQL with different org_id in WHERE → zero rows (RLS overrides)

### 10.2 Additional Security Tests

#### SECURITY-TEST-005: Authentication and Revocation Security

- Lockout after 5 failed attempts
- Locked account cannot authenticate
- Expired access token rejected
- Revoked refresh token rejected
- Deactivated user session immediately invalid (auth_version check)
- Role change invalidates existing tokens (auth_version mismatch → 401)
- Password change invalidates existing tokens
- Force-revoke by Owner invalidates all user sessions
- auth_version mismatch returns 401 with reason `session_invalidated`
- Redis cache of auth_version expires and re-fetches correctly

#### SECURITY-TEST-006: Input Validation

- SQL injection in search parameters → no effect
- XSS payload in text fields → sanitized
- Oversized file upload → rejected
- Invalid file type with spoofed extension → rejected
- Malformed registration number → rejected
- Path traversal in file names → sanitized

#### SECURITY-TEST-007: Audit Completeness

- Login creates audit record
- Document download creates audit record
- Status change creates audit record
- Masked field reveal creates audit record
- Audit records cannot be modified by application role
- Audit records cannot be deleted by application role

#### SECURITY-TEST-008: Document Quarantine Security

```
Given: A file has been uploaded to quarantine but not yet validated
When: A user requests a download URL for that document
Then: Response is 403 or 404 (no signed URL generated)
And: The quarantine object is not accessible
```

Test cases:
- Infected file uploaded → document status = `validation_failed`; no canonical object exists
- Unvalidated file (pending_validation) → download URL request denied
- Validated file → download URL generated, file accessible
- Failed validation → no canonical object created; quarantine object deleted
- Cross-tenant document access → denied
- Signed URL cannot be generated for document with quarantine file_key prefix
- Abandoned quarantine object cleaned up after 24 hours
- Partial upload → validation fails at content-type check

### 10.3 Manual Security Reviews

#### SECURITY-REVIEW-01 (Review Gate SECURITY-01)

After Phase 01 (Auth + Tenancy + RBAC):
- Review JWT implementation
- Verify RLS policies on all tables
- Run cross-tenant test suite
- Run RBAC test suite
- Review password hashing configuration
- Verify audit log append-only

#### SECURITY-REVIEW-02 (Review Gate SECURITY-02)

After Phase 03 (Documents):
- Review upload pipeline (malware scan, type validation, EXIF strip)
- Verify signed URL generation and expiry
- Test direct S3 access prevention
- Review document access audit logging
- Verify file type checking (magic bytes)

#### MONEY-REVIEW-01 (Review Gate MONEY-01)

After Phase 06-07 (Payout + Reconciliation):
- Review payout calculation accuracy
- Verify rule snapshot immutability
- Test override audit trail
- Verify split total constraint
- Review statement import validation

#### FINAL-REVIEW-01 (Review Gate FINAL-01)

Before production:
- Full security audit
- Penetration test (third-party, NFR-SEC-009)
- Review all audit completeness
- Verify backup and restore
- Review rate limiting effectiveness
- OWASP ASVS L2 checklist
