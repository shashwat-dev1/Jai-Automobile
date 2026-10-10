# DSA OS — Known Limitations & Environmental Considerations

> **Document Version:** 1.0.0  
> **Status:** Current Production Readiness Assessment

---

## 1. Cloud & Serverless Infrastructure Environment

### Vercel Serverless Hosting
- **Frontend SPA Deployment:** Vercel serves the compiled React 18 TypeScript application (`dist/`). Single-Page Application rewrites are configured in `vercel.json` (`"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`).
- **Limitation:** Vercel cannot run persistent long-running background daemons (such as Redis/ARQ task workers or ClamAV antivirus daemon sidecars).
- **Architecture Solution:** For a full production backend deployment, the FastAPI application, PostgreSQL database, and ARQ background workers should be deployed to containerized infrastructure (such as AWS ECS / App Runner, Railway, Render, or a dedicated Linux VM with Docker Compose).
- **Prototype Resilience:** When the backend API is unreachable or running in a serverless-only static preview, the client gracefully falls back to deterministic in-memory client state and Firebase Cloud Firestore persistence, ensuring the application remains interactive for demonstrations without throwing HTTP 500 or white-screen errors.

---

## 2. External Third-Party Integrations

### OCR Document Processing
- **Current Capability:** Deterministic local heuristic OCR field extraction is implemented in `backend/app/modules/documents/service.py` (`_run_heuristic_ocr`), extracting PAN numbers, customer names, registration numbers, and dates with confidence scoring.
- **Human-in-the-Loop Review:** The application displays all extracted fields in `DocumentExtractionReviewModal`, where operators inspect the data and can manually correct any misrecognized characters before saving to the case dossier.
- **External AI/Cloud OCR:** Per `AGENTS.md` Section 4 and DPDP compliance rules, customer documents are never transmitted to third-party public cloud OCR APIs without explicit tenant authorization. Integrating proprietary Indian banking OCR engines (e.g. Karza, Signzy, or AWS Textract India region) requires production API keys and private VPC peering.

### ClamAV Antivirus Daemon
- **Current Capability:** In Docker Compose, ClamAV runs as a sidecar container on port 3310.
- **Limitation in Lightweight / Test Environments:** When ClamAV daemon is offline in development, the document validation pipeline gracefully bypasses antivirus connection errors while continuing to enforce strict MIME-type sniffing, PDF structure inspection, and magic-byte validation.

### Bank Statement PDF / Excel Parser
- **Current Capability:** Full CSV statement ingestion, column mapping, dry-run simulation, tolerance matching, and 24-hour batch reversal are fully implemented.
- **Password-Protected Bank Statements:** Bank statements in password-protected PDF formats (e.g. HDFC/ICICI password-protected statements) require a password entry modal prior to extraction. Standard CSV exports from corporate net banking portals are supported directly.

---

---

## 3. Regulatory & Privacy Considerations

- **Synthetic Seed Identifiers:** In compliance with `AGENTS.md` Section 5, all seeded customer names, PAN numbers (`ABCDE****F`), mobile numbers, and vehicle registration numbers are synthetically generated. Real citizen PII is strictly prohibited in development and demonstration databases.
- **PAN Decryption Audit Log:** Production deployments must securely store the Fernet symmetric encryption key (`ENCRYPTION_KEY`) in an enterprise secrets manager (e.g. AWS Secrets Manager or HashiCorp Vault). Every PAN decryption event is permanently recorded in the immutable audit log.
- **Masked Mobile Numbers:** All general listings for referral partners mask mobile numbers (`98****4551`) to prevent unauthorized scraping or contact harvesting.

---

## 4. Phase 1 Operational Considerations

### SMS OTP Verification Integration
- **Current Architecture:** Guest referral partner intake currently utilizes instant mobile number lookup and registration within the DSA organization tenant. Returning partners are identified by matching normalized 10-digit mobile numbers without password friction.
- **Future OTP Gateway:** Adding an OTP verification challenge via SMS (e.g., MSG91, Twilio, or Gupshup) requires choosing a paid telecom SMS gateway provider and acquiring DLT (Distributed Ledger Technology) template approvals under TRAI guidelines in India. This should be activated when commercial accounts are provisioned.

### Referral Commission Bank Transfers
- **Current Architecture:** Commission workflows enforce administrative review (`pending_review` -> `approved` -> `paid`) and record mandatory bank transaction references (UTR / NEFT / IMPS identifiers), payment dates, and approving user IDs in the audit ledger.
- **Automated Payout APIs:** Direct programmatic bank transfers (via ICICI Corporate Connected Banking or RazorpayX Payouts) require signed banking API contracts and corporate bank account keys. In Phase 1, payments are executed via standard corporate net banking and reconciled via UTR entry.

