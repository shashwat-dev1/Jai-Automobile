# Phase 00 — Foundation

## Objective

Initialize the project repository, toolchain, database infrastructure, Docker configuration, CI skeleton, and the shared application foundation that all subsequent phases depend on.

## Dependencies

None — this is the base phase.

## Requirements Covered

| Req ID | Requirement |
|---|---|
| NFR-SEC-001 | TLS configuration |
| NFR-REL-002 | Transaction integrity |
| NFR-PRV-003 | India-region hosting configuration |
| LEG-002 | No customer-facing loan features |
| DC-1 | Modular monolith structure |
| DC-3 | Versioned migrations |
| DC-4 | Configuration as data |
| IF-7 | REST/JSON API under /api/v1 |

## Database Changes

- Create PostgreSQL database `dsaos`
- Create roles: `dsaos_migrator` (table owner), `dsaos_app` (application), `dsaos_readonly` (backup)
- Create `organizations` table (platform-level, no RLS)
- Configure Alembic with dual-role migration pattern
- Create initial migration with `organizations` table

## Backend Modules

- `app/main.py` — FastAPI app factory with CORS, error handlers, health endpoints
- `app/config.py` — pydantic-settings configuration (DB, Redis, S3, JWT secrets)
- `app/database.py` — SQLAlchemy async engine, session factory, base model class
- `app/middleware/` — Request ID, CORS, security headers, tenant context placeholder
- `app/shared/models.py` — TenantBase model (org_id, timestamps, soft delete, version)
- `app/shared/schemas.py` — Common response envelope, error schema, pagination
- `app/shared/exceptions.py` — Domain exception hierarchy
- `app/shared/pagination.py` — Cursor-based pagination utility
- `app/shared/events.py` — Internal event bus (sync for now, async-ready)
- Health check endpoints: `GET /health`, `GET /health/ready`

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/health/ready` | Readiness probe |
| GET | `/api/v1/` | API root / version info |

## Frontend Routes/Components

- Initialize Vite + React + TypeScript project in `frontend/`
- Configure path aliases, ESLint, Prettier
- Set up CSS custom properties from design system tokens
- Import IBM Plex Sans font
- Create app shell with sidebar layout placeholder
- Create shared components: Button, Input, Table skeleton
- Create API client utility (fetch wrapper with auth header injection)
- Configure proxy to backend in dev mode

## Business Rules

None — infrastructure only.

## Security Implications

- Security headers configured on all responses (HSTS, CSP, X-Frame-Options, etc.)
- Database roles separated (migrator vs app vs readonly)
- Secrets loaded from environment variables, never hardcoded
- `.env.example` with dummy values; `.env` in `.gitignore`

## Tests

- Health endpoint returns 200 with database/Redis/storage status
- Database connection test
- Migration up/down works
- Security headers present on responses
- CORS configured correctly
- Request ID propagated through response

## Acceptance Criteria

1. `docker compose up` starts PostgreSQL, Redis, MinIO, backend, and frontend
2. `GET /health` returns `{"status": "ok", "database": "ok", "redis": "ok", "storage": "ok"}`
3. `GET /api/v1/` returns version information
4. Frontend loads at `http://localhost:5173` with the app shell
5. Alembic migration creates the `organizations` table
6. Database has three roles: `dsaos_migrator`, `dsaos_app`, `dsaos_readonly`
7. Security headers present on all API responses
8. All tests pass

## Definition of Done

- [ ] Repository initialized with Python (backend) and Node (frontend) projects
- [ ] Docker Compose configuration runs all services
- [ ] Database roles and initial migration exist
- [ ] Health endpoints operational
- [ ] Security headers configured
- [ ] Frontend app shell renders with design system tokens
- [ ] CI runs linting and tests
- [ ] `docs/` updated

## Risks

- Docker/MinIO version compatibility across dev environments
- Python/Node version mismatches — lock in `.python-version` and `.nvmrc`

## Files Expected to Change/Create

```
docker-compose.yml
docker-compose.override.yml
.env.example
.gitignore
.python-version
.nvmrc

backend/
  pyproject.toml (or requirements.txt)
  app/
    __init__.py
    main.py
    config.py
    database.py
    middleware/__init__.py
    middleware/security_headers.py
    middleware/request_id.py
    shared/__init__.py
    shared/models.py
    shared/schemas.py
    shared/exceptions.py
    shared/pagination.py
    shared/events.py
  migrations/
    env.py
    versions/001_create_organizations.py
  tests/
    conftest.py
    test_health.py
  Dockerfile

frontend/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    app/routes.tsx
    design-system/tokens.css
    design-system/reset.css
    design-system/typography.css
    shared/lib/api.ts
    shared/components/Button.tsx
    shared/components/Input.tsx
  Dockerfile
  .eslintrc.cjs

nginx/
  nginx.conf
```
