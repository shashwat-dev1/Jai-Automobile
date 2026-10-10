# ADR-006: Toolchain and Dependency Version Pinning

**Status:** Accepted  
**Date:** 2026-10-04  

## Context

DSA OS requires a coherent, production-ready development stack across backend (Python/FastAPI), frontend (React/TypeScript/Vite), database (PostgreSQL 16), storage (MinIO), and asynchronous workers (ARQ/Redis). Discrepancies in minor or major versions between developer machines, Docker containers, and CI pipelines introduce subtle bugs, build breakages, and security risks.

This ADR explicitly pins and defines the supported baseline versions for Release 1.

---

## Decision

The project pins the following toolchain and dependency baselines:

### 1. Runtimes and Package Managers

| Tool | Pinned Version | Rationale & Constraints |
|---|---|---|
| **Python** | `3.11.9` | Stable LTS. High async performance improvements over 3.10; mature wheel availability for `asyncpg`, `cryptography`, and `argon2-cffi`. Avoid 3.12/3.13 bleeding edge due to ecosystem package compatibility. |
| **Node.js** | `20.17.0 (LTS)` | Active LTS ("Iron"). Native fetch API, high V8 performance, rock-solid stability in containerized builds. |
| **Python Package Manager** | `uv` (>=0.4) / `pip` (>=24.0) | Standard `pyproject.toml` (PEP 517/621) with pinned lockfile. `uv` recommended for blazing fast local virtualenv and dependency installation. |
| **Node Package Manager** | `npm 10.8.x` | Bundled with Node 20 LTS; standard `package-lock.json` enforced via `npm ci`. |

---

### 2. Backend Stack (FastAPI / Python)

| Dependency | Pinned Version | Rationale & Compatibility Constraints |
|---|---|---|
| **FastAPI** | `0.115.x` | Modern async REST framework with automatic OpenAPI 3 documentation. |
| **Starlette** | `0.38.x` | Underlying ASGI toolkit paired with FastAPI. |
| **Uvicorn** | `0.30.x` | High-performance ASGI web server with `uvloop` and `httptools`. |
| **Pydantic** | `2.9.x` | Pydantic v2 core in Rust for rapid JSON schema validation, serialized models, and request sanitization. |
| **Pydantic-Settings** | `2.5.x` | Type-safe environment variable parsing with validation. |
| **SQLAlchemy** | `2.0.35+` | Modern `Mapped[]` type annotations, async session management, and robust SQL expression composition. |
| **Asyncpg** | `0.29.x` | Highest-performance asynchronous driver for PostgreSQL. |
| **Alembic** | `1.13.x` | Reliable schema migration engine with native async PostgreSQL support (`async_engine`). |
| **ARQ** | `0.26.x` | Async Redis queue natively integrated with Python `asyncio`; selected over Celery for simplicity and low overhead. |
| **Redis (Python client)** | `5.0.x` | Async Redis connection pool used by ARQ and session caching. |
| **Argon2-cffi** | `23.1.x` | Cryptographically superior password hashing algorithm recommended by OWASP. |
| **PyJWT** | `2.9.x` | RS256-only JWT signing and validation. Single algorithm, no negotiation. |
| **cryptography** | `43.0.x` | Provides RS256 key support for PyJWT. |
| **MinIO Python SDK** | `7.2.x` | S3 API client supporting presigned PUT/GET URLs and bucket prefix management. |
| **Pillow** | `10.4.x` | Image manipulation for EXIF stripping, format validation, and thumbnail generation. |
| **Pyclamd** | `0.4.x` | Python socket client communicating with ClamAV daemon for malware scanning. |

---

### 3. Frontend Stack (React / TypeScript)

| Dependency | Pinned Version | Rationale & Compatibility Constraints |
|---|---|---|
| **React** | `18.3.1` | Production-hardened stable release. React 19 is avoided for Release 1 to prevent ecosystem third-party library peer-dependency collisions. |
| **React DOM** | `18.3.1` | Matching DOM renderer for React 18. |
| **TypeScript** | `5.5.x` | Strict type-checking, composite project support, and high IDE performance. |
| **Vite** | `5.4.x` | Next-generation frontend build tool with lightning-fast HMR and Rollup production bundling. |
| **TanStack Query (React Query)** | `5.56.x` | Server-state caching, stale-while-revalidate queries, and mutation hooks for all API calls. |
| **Zustand** | `4.5.x` | Minimalist client-state store (auth tokens, current tenant, UI toggles) avoiding Redux overhead. |
| **React Router** | `6.26.x` | Client-side routing with nested layouts and protected route guards. |
| **Vanilla CSS / Custom Design System** | Native CSS Variables | Implements the Graphite Ledger design tokens without mandatory heavy utility frameworks. |

---

### 4. Infrastructure & Sidecars (Docker)

| Service | Container Image / Version | Configuration Notes |
|---|---|---|
| **PostgreSQL** | `postgres:16-alpine` | PostgreSQL 16 LTS with optimized RLS execution plans, JSONB enhancements, and connection efficiency. |
| **Redis** | `redis:7.2-alpine` | In-memory datastore for ARQ queue jobs and rapid `auth_version` deactivation lookups. |
| **MinIO** | `minio/minio:RELEASE.2024-09-22T00-33-43Z` | Private S3-compatible object storage with quarantine and canonical prefix isolation. |
| **ClamAV** | `clamav/clamav:1.3-alpine` | Lightweight antivirus daemon for stream/file scanning before document promotion. |
| **Nginx** | `nginx:1.27-alpine` | Reverse proxy enforcing TLS 1.2+ minimum cipher suites, rate limiting, and request buffering. |

---

### 5. Testing Frameworks

| Tool | Pinned Version | Usage |
|---|---|---|
| **pytest** | `8.3.x` | Backend test runner. |
| **pytest-asyncio** | `0.24.x` | Native async fixture and test execution. |
| **pytest-cov** | `5.0.x` | Test coverage enforcement (>=80% line coverage required). |
| **httpx** | `0.27.x` | Async HTTP client for integration testing FastAPI endpoints (`AsyncClient`). |
| **Vitest** | `2.1.x` | Ultra-fast unit and component test runner matching Vite configuration. |
| **@testing-library/react** | `16.0.x` | DOM testing utilities focusing on user interactions. |
| **Playwright** | `1.47.x` | End-to-end browser automation for critical path smoke tests (P1). |

---

## Upgrade Policy

1. **Patch Updates (`x.y.Z`)**: Permitted at any time during development for security fixes after running test suites.
2. **Minor Updates (`x.Y.0`)**: Permitted between phases if required for bug fixes; requires full test suite run across backend, frontend, and Docker integration.
3. **Major Updates (`X.0.0`)**: Strictly prohibited during Release 1 execution without an explicit architectural decision record.
