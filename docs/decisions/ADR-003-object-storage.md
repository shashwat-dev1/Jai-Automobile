# ADR-003: Private S3-Compatible Object Storage

**Status:** Accepted
**Date:** 2026-10-04

## Decision

Customer documents are stored in MinIO (S3-compatible object storage), self-hosted, with all buckets private. 

Storage enforces strict **quarantine separation**:
1. **Quarantine Zone** (`quarantine/{org_id}/{upload_id}/{filename}`): Direct browser uploads land exclusively here via short-lived presigned PUT URLs (5 min expiry). Files in this zone are untrusted and permanently inaccessible via document download APIs.
2. **Asynchronous Validation & Scanning**: An ARQ worker validates magic bytes/MIME type, runs malware scanning (ClamAV), strips EXIF metadata, and verifies file integrity.
3. **Canonical Zone** (`{org_id}/documents/{document_id}/{version}/{filename}`): Only if validation and scanning pass is the file safely copied/promoted to the canonical private store, and the document record marked `received`. If validation fails, the quarantine object is deleted/isolated, and the record is marked `scan_failed`.
4. **Canonical Access**: Canonical documents are accessed exclusively through server-generated signed GET URLs with a maximum 5-minute expiry. Signed URLs are never issued for quarantined or unvalidated files.

## Alternatives Considered

1. **Database BLOB storage** — Store files directly in PostgreSQL
2. **Local filesystem** — Store files on the application server's disk
3. **Public cloud S3** — AWS S3 or Google Cloud Storage with public access policies
4. **Private S3-compatible (MinIO)** — Self-hosted, private, S3 API compatible
5. **Direct upload to canonical store with post-scan deletion** — Rejected due to race conditions where untrusted/infected files might be downloaded before scanning completes.

## Rationale

- Database BLOB storage degrades query performance and complicates backups at scale
- Local filesystem doesn't scale beyond a single server and complicates backups
- Public cloud S3 raises data residency concerns (India hosting requirement, NFR-PRV-003) and sends documents outside DSA control
- MinIO is S3-compatible, self-hosted, India-deployable, and keeps documents under DSA control
- Private buckets with signed URLs ensure documents are never publicly accessible
- Separate quarantine prefix prevents untrusted, malicious, or malformed files from ever entering canonical storage or reaching download APIs
- Server-side encryption (SSE-S3) provides encryption at rest
- Migration to managed S3-compatible storage is seamless (same API)

## Consequences

- MinIO must be deployed and maintained as part of the infrastructure with distinct prefix permissions
- Background worker (ARQ) and scanner (ClamAV) are required for document promotion
- Backup strategy includes object storage (canonical prefix only; quarantine excluded from long-term backup)
- Pre-signed upload URLs target quarantine paths only; canonical download URLs require verification
- Automatic retention/cleanup policy sweeps abandoned quarantine objects after 24 hours
- All document access is mediated through the API (permission check + RLS + audit)
