# =============================================================================
# DSA OS — Backend Dockerfile
# =============================================================================

# ---------------------------------------------------------------------------
# Base stage: shared Python setup
# ---------------------------------------------------------------------------
FROM python:3.11.9-slim-bookworm AS base

# Security: Don't run as root in production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=100

WORKDIR /app

# Install system dependencies required by some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Required by asyncpg, cryptography
    libffi-dev \
    libssl-dev \
    # Required by Pillow
    libjpeg62-turbo-dev \
    libpng-dev \
    # Required by python-magic
    libmagic1 \
    # Cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Dependencies stage: install Python packages
# ---------------------------------------------------------------------------
FROM base AS dependencies

COPY pyproject.toml README.md ./
COPY app/ ./app/
RUN pip install --no-cache-dir -e ".[dev]"

# ---------------------------------------------------------------------------
# Development stage: hot-reload enabled, all dev tools available
# ---------------------------------------------------------------------------
FROM dependencies AS development

COPY . .

# Create keys directory (JWT keys mounted as secrets)
RUN mkdir -p /app/keys

# Create non-root user
RUN addgroup --system --gid 1001 dsaos && \
    adduser --system --uid 1001 --gid 1001 dsaos

# Do NOT switch to non-root in dev for volume mount compatibility
# In production, switch user before CMD

EXPOSE 8000

# Default command (overridden by docker-compose)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---------------------------------------------------------------------------
# Production stage: minimal, secure image
# ---------------------------------------------------------------------------
FROM base AS production

# Install only runtime dependencies (no dev/test tools)
COPY pyproject.toml README.md ./
COPY app/ ./app/
RUN pip install --no-cache-dir -e "."

COPY . .

RUN mkdir -p /app/keys

# Non-root user
RUN addgroup --system --gid 1001 dsaos && \
    adduser --system --uid 1001 --gid 1001 dsaos && \
    chown -R dsaos:dsaos /app

USER dsaos

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
