# DSA OS — Open Questions

> Questions that need resolution. None of these block Phase 00-03 implementation.
> Questions are prioritized by the phase that needs the answer.

---

## Business Questions

### BQ-01: Actual lender payout grids
**Needed by:** PH-06 (Payout Engine)
**Owner:** Pilot DSA
**Status:** OPEN

What are the actual payout percentages, slab structures, and conditions for each lender the pilot DSA works with? The system supports configurable rules; demo data will use fictional rates until real data is collected.

### BQ-02: Document type catalogue and per-lender checklist rules
**Needed by:** PH-03 (Documents)
**Owner:** Pilot DSA
**Status:** OPEN

What is the exact list of document types required? Which documents are mandatory vs optional per lender and product? The system will ship with a reasonable default list; the pilot DSA configures their actual requirements.

### BQ-03: OTC and PDD terminology in use
**Needed by:** PH-05 (PDD/SLA)
**Owner:** Pilot DSA
**Status:** OPEN

The PRD notes that OTC/PDD terminology differs between sources. What terms does the pilot DSA use? The system labels are configurable.

### BQ-04: Actual SLA values per stage
**Needed by:** PH-04 (Lender Workflow)
**Owner:** Pilot DSA
**Status:** OPEN

What are the expected turnaround times per case stage? Defaults will be seeded but are configurable per org.

### BQ-05: Rejection reason codes
**Needed by:** PH-04 (Lender Workflow)
**Owner:** Pilot DSA
**Status:** OPEN

What rejection reason codes are used by each lender? System will ship with common codes; pilot DSA can add lender-specific ones.

### BQ-06: Split arrangement structures
**Needed by:** PH-06 (Payout Engine)
**Owner:** Pilot DSA
**Status:** OPEN

How are payout splits structured between the DSA, dealers, sub-DSAs, and employees? What are typical split percentages? System supports percentage and flat splits; actual values configured per source.

### BQ-07: GST and TDS treatment for the pilot DSA
**Needed by:** PH-06 (Payout Engine)
**Owner:** CA
**Status:** OPEN

Is the pilot DSA under forward charge or reverse charge for GST on commissions? What is the applicable TDS rate and threshold? System makes both configurable; CA confirmation needed.

### BQ-08: Retention periods and consent wording
**Needed by:** PH-10 (Hardening)
**Owner:** Legal and CA
**Status:** OPEN

What are the data retention periods for customer documents, case records, and audit logs? What consent notice wording should be used? System enforces configurable retention; wording needs legal review.

### BQ-09: Statement formats from real samples
**Needed by:** PH-07 (Reconciliation)
**Owner:** Pilot DSA
**Status:** OPEN

What do actual lender payout statements look like (column structure, data format)? Needed to build accurate column mapping defaults. System supports custom mappings.

### BQ-10: Dealer and sub-DSA portal scope
**Needed by:** Not in MVP
**Owner:** Product Owner
**Status:** DEFERRED (Phase 2)

Is a dealer/sub-DSA portal needed for the pilot? Per PRD, this is P2 scope.

---

## Technical Questions

### TQ-01: Queue technology
**Needed by:** PH-00 (Foundation)
**Owner:** Engineering
**Status:** DECIDED — ARQ (async Redis queue)
**Rationale:** Simple, async-native, sufficient for pilot scale. Migration to Celery possible if needed.

### TQ-02: Storage provider
**Needed by:** PH-00 (Foundation)
**Owner:** Engineering
**Status:** DECIDED — MinIO (self-hosted, S3-compatible)
**Rationale:** India-hosted, DSA-controlled, private. Production may use managed S3-compatible service.

### TQ-03: Deployment environment
**Needed by:** PH-00 (Foundation)
**Owner:** Product Owner
**Status:** OPEN

Is the pilot deployed on a managed India-region cloud provider (e.g., AWS Mumbai, Azure Central India) or on DSA-controlled infrastructure? Docker Compose works for both; Kubernetes manifests prepared for managed.

**Default assumption:** Managed India-region VPS with Docker Compose for pilot.

### TQ-04: Authentication mechanism
**Needed by:** PH-01 (Auth/Tenancy)
**Owner:** Engineering
**Status:** DECIDED — Custom JWT with Argon2id
**Rationale:** No dependency on external auth providers for pilot. Keeps customer data in-house. Upgrade path to OAuth2/OIDC exists.

### TQ-05: Email delivery provider
**Needed by:** PH-09 (Notifications, P1)
**Owner:** Product Owner
**Status:** OPEN

Which transactional email provider for notifications? Options: SMTP relay, AWS SES, SendGrid, Mailgun. The notification system uses a channel abstraction — the provider is pluggable.

**Default assumption:** SMTP relay for pilot; upgrade later.

### TQ-06: Malware scanning approach
**Needed by:** PH-03 (Documents)
**Owner:** Engineering
**Status:** DECIDED — ClamAV sidecar container
**Rationale:** Open source, self-hosted, no documents leave the environment. Runs as a Docker sidecar.

### TQ-07: Browser testing capability
**Needed by:** PH-10 (Hardening)
**Owner:** Engineering
**Status:** OPEN

Is browser-based E2E testing needed for the pilot? If so, Playwright is the recommended tool. Not blocking for initial phases.

### TQ-08: Monitoring stack
**Needed by:** PH-10 (Hardening)
**Owner:** Engineering
**Status:** DECIDED — Prometheus + Grafana
**Rationale:** Open source, self-hosted, well-integrated with FastAPI and PostgreSQL.

---

## Resolution Protocol

1. Questions marked OPEN do not block implementation if the system is designed to be configurable
2. Business questions are resolved with the pilot DSA during discovery/onboarding
3. Technical questions with DECIDED status have rationale recorded; alternatives considered in ADRs
4. Legal questions require professional review — the system builds the mechanism, not the policy content
