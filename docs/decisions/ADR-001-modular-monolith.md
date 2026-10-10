# ADR-001: Modular Monolith Architecture

**Status:** Accepted
**Date:** 2026-10-04

## Decision

DSA OS is built as a modular monolith with clear module boundaries (auth, parties, cases, documents, lenders, workflow, payout, reporting, notifications, privacy, audit).

## Alternatives Considered

1. **Microservices** — Separate services per domain area with API gateways
2. **Monolith without module boundaries** — Single codebase without internal structure
3. **Modular monolith** — Single deployment unit with clear internal module boundaries

## Rationale

- Small team building for a single pilot customer; microservices add operational complexity without proportional benefit
- Module boundaries enforce separation of concerns and enable future extraction if needed
- Single database simplifies transactions, referential integrity, and tenant isolation via RLS
- Deployment simplicity (Docker Compose) critical for pilot timeline
- PRD mandates this architecture (DC-1)

## Consequences

- All modules share a database; cross-module queries are possible but should go through services
- Module boundaries enforced by convention (directory structure, import rules), not by process isolation
- If scale demands it, high-traffic modules (e.g., notifications, reporting) can be extracted later
- No distributed transaction complexity
