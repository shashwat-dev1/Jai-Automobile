# DSA OS — Testing Strategy

> Defines the test approach, coverage targets, and test infrastructure.

---

## Test Framework

| Layer | Tool | Runner |
|---|---|---|
| Backend unit/integration | pytest + pytest-asyncio | `pytest` |
| Backend API | httpx (TestClient) | `pytest` |
| Frontend unit | Vitest + React Testing Library | `vitest` |
| E2E (P1) | Playwright | `npx playwright test` |

## Coverage Targets

| Module | Minimum Coverage |
|---|---|
| Payout engine | 90% |
| Checklist engine | 90% |
| State machine transitions | 90% |
| RBAC enforcement | 100% of permission matrix |
| Tenant isolation | 100% of cross-tenant scenarios |
| All other modules | 80% |

## Test Categories

### 1. Tenant Isolation Tests (Critical)
- Cross-tenant read fails (returns 404, not 403)
- Cross-tenant write fails
- Cross-tenant search returns empty
- Manipulated org_id in body ignored
- RLS bypass attempts fail
- FORCE ROW LEVEL SECURITY verified

### 2. RBAC Tests
- Full permission matrix tested: every role x every capability
- Field Executive scope filtering (own cases only)
- Masked field reveal restricted to permitted roles

### 3. Business Rule Tests
- State machine transitions (valid and invalid)
- Document gate for Applied status
- Winning application constraint
- Disbursal vs sanction validation
- Payout computation (percent, flat, slab)
- Split total constraint
- Reconciliation matching and classification

### 4. Security Tests
- Authentication flow (login, refresh, lockout)
- Signed URL generation and expiry
- File type and size validation
- EXIF stripping verification
- Audit log append-only enforcement
- Rate limiting effectiveness

### 5. Integration Tests
- End-to-end case lifecycle (create -> documents -> apply -> sanction -> disburse -> payout -> reconcile)
- Import and export workflows
- Notification generation from domain events

## Test Data

- Fictional demo data in `backend/seed/` module
- No real PAN, Aadhaar, bank accounts, or customer data
- Test fixtures create isolated org+user contexts per test
- Database is reset between test suites (not between individual tests for speed)

## CI Pipeline

```
lint (ruff + eslint) -> type-check (mypy + tsc) -> unit tests -> integration tests -> coverage report
```
