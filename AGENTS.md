# DSA OS — AGENT WORKSPACE RULES

These rules apply to every AI agent working on this repository.

---

## 1. SOURCE OF TRUTH

The current product sources of truth are:

1. `DSA_OS_PRD_v1.0.docx`
2. `DSA_OS_SRS_v1.0.docx`

Older documents are reference material only.

The PRD/SRS take precedence over:

- old research
- old implementation
- assumptions
- design references
- AI-generated suggestions

The `design/` folder contains visual references and concepts, not mandatory pixel-perfect specifications.

If design conflicts with PRD/SRS:

**PRD/SRS wins.**

---

## 2. PRODUCT

DSA OS is a multi-tenant operating platform for vehicle-loan DSAs in India.

Core lifecycle:

Lead
→ Customer
→ Case
→ Documents
→ Multiple Lender Applications
→ Sanction
→ Disbursement
→ PDD / RC / Hypothecation
→ Payout Expectation
→ Payout Receipt
→ Reconciliation
→ Clawback / Closure

Product thesis:

> Never lose track of a case, and never lose a rupee of payout.

The product is NOT a generic CRM and NOT an AI loan-decisioning platform.

---

## 3. ARCHITECTURE

Default architecture:

- React
- TypeScript
- Vite
- FastAPI
- Python
- PostgreSQL 15+
- Private S3-compatible object storage
- Background workers
- Containerized deployment
- Modular monolith

Do not introduce microservices or distributed infrastructure without an explicit architectural decision record.

---

## 4. SECURITY

Security is a first-class requirement.

The system must enforce:

- tenant isolation
- server-side authorization
- PostgreSQL RLS
- secure authentication
- private object storage
- short-lived signed URLs
- sensitive-data masking
- encryption where required
- audit logging
- secure uploads
- malware/file validation
- input validation
- rate limiting where appropriate

Never rely on frontend visibility as authorization.

Never expose customer documents publicly.

Never send customer documents to external/public AI or OCR services unless explicitly authorized by the product requirements.

Document uploads must remain quarantined until validation succeeds. Quarantined/unvalidated objects must never be downloadable through normal document APIs.

### RLS requirement

RLS must be tested against an application database role that cannot bypass policies merely because it owns the table.

Where required, use `FORCE ROW LEVEL SECURITY`.

Tenant isolation must have automated tests.

---

## 5. DATA PRIVACY

Never use real:

- PAN
- Aadhaar
- bank account numbers
- customer phone numbers
- customer documents
- real financial information

for development or seed data.

Demo data must be obviously fictional.

Do not generate realistic-looking valid government identifiers.

Privacy/compliance-sensitive requirements must be implemented according to the PRD/SRS and flagged for legal validation where necessary.

Potential validation areas include:

- DPDP Act requirements
- applicable RBI expectations
- data residency
- retention/deletion requirements

Do not make unsupported legal claims.

---

## 6. BUSINESS RULES

Do not invent actual lender policies.

Do not invent:

- payout percentages
- document requirements
- lender eligibility rules
- SLA values
- tax treatment
- clawback rules

where the PRD/SRS has not established them.

Instead:

1. make the rule configurable
2. use clearly labelled fictional seed data
3. document the assumption
4. record unresolved questions in `docs/OPEN_QUESTIONS.md`

---

## 7. NO FAKE FUNCTIONALITY

Do not fake:

- API responses
- payout calculations
- reconciliation
- authorization
- tenant isolation
- document security
- dashboard metrics

Once backend functionality exists, UI metrics must come from actual application data.

Future functionality may be represented visually only when explicitly classified as future scope.

---

## 8. DOMAIN SEPARATION

Do not collapse:

Customer
and
Case
and
Lender Application

into one entity.

A customer may have multiple cases.

A case may have multiple lender applications.

Only one lender application may become the winning application.

Payout belongs to the disbursed application/case context, not directly to a generic customer.

---

## 9. CODE QUALITY

Prefer:

- small modules
- typed interfaces
- explicit domain services
- testable business logic
- migrations
- reusable components
- clear naming
- consistent formatting
- linting
- automated tests

Avoid:

- giant files
- business logic inside UI components
- business logic directly inside route handlers
- duplicated logic
- unnecessary abstractions
- dead code

---

## 10. CONFIGURATION

Business-specific behavior should be configurable.

Examples:

- lenders
- products
- document rules
- payout rules
- SLAs
- source types
- notification rules
- retention settings

Do not hardcode values that the business may need to change.

---

## 11. GIT

Use logical commits.

Examples:

`feat(auth): add authentication foundation`

`feat(tenancy): add tenant isolation`

`feat(cases): implement case lifecycle`

`feat(documents): implement secure document storage`

`feat(payout): implement payout engine`

`test(security): add tenant isolation tests`

Do not make one giant commit for an entire phase.

---

## 12. IMPLEMENTATION PRINCIPLE

Build in dependency order:

Foundation
→ Database
→ Security
→ Domain
→ Services
→ APIs
→ UI
→ Workflows
→ Analytics
→ Hardening

Do not build disconnected screens first.

---

## 13. DESIGN

The `design/` folder contains visual references and concepts, not mandatory pixel-perfect specifications.

The design folder may contain future-state concepts. Agents must not implement functionality solely because it appears in a design reference. Release scope is determined by the PRD/SRS and requirements traceability matrix.

Agents have freedom to improve the design.

The UI should feel:

- premium
- operational
- financial
- trustworthy
- purpose-built
- information-dense
- fast

Avoid generic AI/SaaS aesthetics.

Avoid automatically using blue/purple gradients or generic dashboard templates.

Prefer strong typography, clear information hierarchy, tabular financial data, meaningful status treatment and operational density.

Create and maintain:

`docs/DESIGN_SYSTEM.md`

---

## 14. DOCUMENTATION STATE

The repository must maintain:

`docs/PROGRESS.md`

`docs/HANDOFF.md`

`docs/OPEN_QUESTIONS.md`

`docs/REQUIREMENTS_TRACEABILITY.md`

`docs/DESIGN_SYSTEM.md`

`docs/ARCHITECTURE.md`

`docs/DATA_MODEL.md`

`docs/API.md`

`docs/SECURITY.md`

`docs/TESTING.md`

`docs/DEPLOYMENT.md`

These files are persistent project memory.

Agents must update them as implementation progresses.

---

## 15. STOP CONDITIONS

An agent must stop and request human review when:

- a security architecture decision is required
- a business rule cannot be safely inferred
- a PRD/SRS conflict cannot be resolved
- a destructive migration is required
- real customer data would be needed
- an external integration is required but unspecified
- a major architecture change is proposed

Do not silently make consequential decisions.

---

## 16. DEFINITION OF DONE

A feature is not complete because the screen exists.

It is complete only when:

- backend behavior exists
- authorization exists
- database behavior is correct
- UI works with real backend data
- validation exists
- tests exist
- error states exist
- audit behavior exists where applicable
- documentation is updated
- no known regression exists