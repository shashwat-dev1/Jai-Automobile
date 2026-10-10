# ADR-004: Background Jobs with ARQ

**Status:** Accepted
**Date:** 2026-10-04

## Decision

Background jobs (document processing, SLA checks, notifications, statement imports) use ARQ, an async Redis-backed job queue for Python.

## Alternatives Considered

1. **Celery** — Mature, feature-rich, widely adopted
2. **ARQ** — Lightweight, async-native, Redis-backed
3. **Dramatiq** — Modern alternative to Celery
4. **In-process threading** — Background threads within the FastAPI process

## Rationale

- ARQ is async-native, aligning with FastAPI's async architecture
- Simpler setup than Celery (no separate broker configuration beyond Redis)
- Redis is already in the stack for caching and rate limiting
- Sufficient for pilot scale (low job volume)
- Migration to Celery is straightforward if ARQ limitations are hit at scale
- In-process threading is unreliable and doesn't survive process restarts

## Consequences

- ARQ worker runs as a separate process/container
- Job failures are retried with exponential backoff
- Periodic tasks (SLA checks, expiry scans) use ARQ's cron functionality
- Redis is a single point of failure for job queuing (acceptable for pilot)
- If queue reliability becomes critical, migration to Celery with RabbitMQ is the upgrade path
