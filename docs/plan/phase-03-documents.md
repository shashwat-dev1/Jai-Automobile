# Phase 03 — Documents

## Objective

Implement the document checklist engine, secure file upload/storage pipeline, document status workflow, and the document hub UI. This phase establishes the secure file handling foundation used by all subsequent phases.

## Dependencies

- PH-02 (Core Domain): cases, parties, vehicles (documents link to all three)
- PH-01 (Auth/Tenancy): RLS, audit, permissions

## Requirements Covered

| Req ID | Requirement |
|---|---|
| FR-DOC-001 | Generate checklist from rules (product, employment, vehicle condition, lender) |
| FR-DOC-002 | Accept PDF/JPG/PNG up to 15 MB; reject others; malware scan |
| FR-DOC-003 | Document statuses: Requested through Archived |
| FR-DOC-004 | Auto-expire when validity exceeded |
| FR-DOC-005 | Version on replace; earlier versions retained |
| FR-DOC-006 | No hard-delete; archive only |
| FR-DOC-007 | Generate copyable request message for missing docs |
| FR-DOC-008 | Signed URLs (5 min); view/download audit-logged |
| FR-VEH-005 | Active hypothecation adds closure docs to checklist |
| NFR-SEC-005 | Private object storage; signed URLs only |
| NFR-SEC-007 | EXIF metadata stripped; filenames sanitized |
| NFR-PRF-003 | Upload shows progress; resume/retry on failure |
| NFR-PRV-004 | Documents not sent to public AI/OCR services |
| BR-12 | Documents never hard-deleted by users |

## Database Changes

### New Tables
- `document_types` — seed data configuration table
- `checklist_rules` — configurable rules (product/employment/vehicle/lender -> document types)
- `documents` — with version chain, status, file reference, RLS

### Migrations
- `014_create_document_types.py`
- `015_create_checklist_rules.py`
- `016_create_documents.py`
- `017_rls_documents.py`
- `018_seed_document_types.py` — seed common document types (PAN Card, Aadhaar, Salary Slip, Bank Statement, RC, Insurance, etc.)

## Backend Modules

### `app/modules/documents/`
- `router.py` — checklist, upload URL, confirm, status change, download, request message
- `service.py` — checklist generation, upload flow, status transitions, version management
- `checklist_engine.py` — rule evaluation: given case attributes, compute required documents
- `storage.py` — S3/MinIO client: signed URL generation (PUT and GET), file deletion
- `processing.py` — EXIF stripping (Pillow), filename sanitization, content-type verification
- `models.py` — DocumentType, ChecklistRule, Document models
- `schemas.py` — request/response schemas

### `app/workers/document_tasks.py`
- `validate_and_promote_document` — ARQ worker pipeline:
  1. Inspect magic bytes / MIME verification
  2. Malware scan (ClamAV)
  3. Strip EXIF metadata from images (Pillow) and sanitize
  4. If validation fails: remove/isolate quarantine object, record `scan_result` / `scan_error`, set status `scan_failed`
  5. If validation passes: copy/promote object from quarantine to canonical private storage (`{org_id}/documents/{document_id}/{version}/{filename}`), delete quarantine object, set status `received`
- `cleanup_abandoned_quarantine` — Periodic job: prune quarantine objects older than 24h
- `check_document_expiry` — Daily job: find expired documents, update status

### Storage client (`app/shared/storage.py`)
- MinIO/S3 client wrapper
- `generate_quarantine_upload_url(org_id, upload_id, filename, content_type, max_size, expiry=300)`
- `promote_quarantine_to_canonical(quarantine_key, canonical_key)`
- `generate_download_url(bucket, key, expiry=300)` — strictly asserts document status is not quarantined or failed
- `delete_object(bucket, key)`
- `verify_object_exists(bucket, key)`

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/cases/{case_id}/checklist` | Get document checklist for case |
| POST | `/api/v1/documents/upload-url` | Get pre-signed upload URL for quarantine zone |
| POST | `/api/v1/documents/confirm` | Confirm upload; enqueues ARQ validation & promotion task |
| GET | `/api/v1/documents/{id}/status` | Get scan and validation status of uploaded document |
| GET | `/api/v1/cases/{case_id}/documents` | List documents for a case (quarantined docs hidden or tagged) |
| PATCH | `/api/v1/documents/{id}/status` | Change document status (verify/reject/archive) |
| GET | `/api/v1/documents/{id}/download` | Get signed download URL (audited; rejected if quarantined/scanning/scan_failed) |
| POST | `/api/v1/cases/{case_id}/documents/request-message` | Generate missing-docs message |
| GET | `/api/v1/config/document-types` | List document types |

## Frontend Routes/Components

- Case detail → **Document checklist panel** showing:
  - Group headers (KYC, Income, Vehicle, Application)
  - Each required document with status chip
  - Upload button per document type
  - Progress bar during upload + processing spinner during virus scan/validation
  - Thumbnail preview for images (generated only post-validation)
  - "View" link that opens signed URL in new tab (disabled while quarantined/scanning)
- **Document upload modal**: file picker + camera capture, drag-and-drop, progress, retry
- **Document viewer**: shows current verified version with status actions (verify/reject/archive)
- **Request message modal**: shows generated text, copy-to-clipboard button
- **Version history drawer**: list of previous versions with view links

### Components
- `DocumentChecklist` — grouped list of required documents with status
- `FileUploader` — drag-and-drop + camera capture + progress bar
- `DocumentCard` — thumbnail, type, status, actions
- `DocumentViewer` — full-screen document view (PDF embed, image display)

## Business Rules

- Checklist is recalculated when product, employment type, vehicle condition, or lender changes
- Active hypothecation on vehicle adds NOC and Form 35 to checklist (FR-VEH-005)
- Documents are never hard-deleted by users (BR-12)
- Each view and download creates an audit record
- File content type verified by magic bytes, not just extension
- Signed URLs expire in 5 minutes maximum
- Signed download URLs are NEVER generated for quarantined, scanning, or scan_failed documents
- Rejected document reverts type to Requested (enables re-upload as new version)

## Security Implications

**Review Gate SECURITY-02** applies after this phase.

- All storage buckets configured as private
- Strict quarantine prefix isolation: `quarantine/{org_id}/{upload_id}/{filename}`
- Untrusted uploads never accessible via normal download APIs
- Asynchronous validation & malware scanning before promotion to canonical store
- Failed scans are auditable and quarantined files purged/isolated
- EXIF stripping removes GPS coordinates and camera metadata
- Filenames sanitized (alphanumeric + limited punctuation only)
- Content-type verification via magic bytes prevents extension spoofing
- Download audit log enables tracking of who accessed what and when
- Documents never leave the approved environment (NFR-PRV-004)

## Tests

### Quarantine & Security Tests (Mandatory)
1. **Infected file → rejected**: EICAR test string or infected payload triggers ClamAV detection, sets status `scan_failed`, purges quarantine object, records audit log.
2. **Unvalidated file → inaccessible**: Attempting to generate download URL or access file while status is `quarantined` or `scanning` returns 400/403.
3. **Validated file → accessible**: Clean document promotes to canonical storage, sets status `received`, signed GET URL succeeds.
4. **Failed validation → no canonical object**: Invalid MIME type, corrupted file, or oversized stream fails validation; confirms canonical S3 key is never created.
5. **Cross-tenant document access → denied**: User from Org A cannot view, download, or access documents from Org B (RLS + API check).
6. **Signed URL cannot be generated for quarantined document**: Explicit API unit test verifies download endpoint rejects non-canonical document states.
7. **Partially completed / abandoned upload**: Unconfirmed or aborted uploads never create canonical documents; daily cleanup job prunes abandoned quarantine objects.

### Checklist & Functional Tests
- Checklist generation: correct documents for used car + salaried + specific lender
- Checklist recalculation: adding lender changes checklist
- Hypothecation trigger: active HP adds NOC and Form 35
- Upload URL generation: valid pre-signed quarantine URL returned
- Upload confirmation: document record created with status Quarantined and ARQ task triggered
- File type validation: PDF/JPG/PNG accepted; others rejected
- File size validation: over 15 MB rejected
- Content type spoofing: .jpg extension with .exe content rejected
- EXIF stripping: GPS data removed from uploaded image
- Filename sanitization: special characters removed
- Document status transitions: valid transitions succeed
- Rejected document creates new version on re-upload
- Signed download URL works within 5 minutes
- Expired download URL fails
- Download creates audit record
- View creates audit record
- Hard delete by user fails (archive only)
- Request message includes all missing mandatory documents
- Field Executive can only access own case documents

## Acceptance Criteria

1. Document checklist correctly generated based on case attributes
2. Checklist updates when lender or product changes
3. File upload works with progress bar and retry on failure
4. Camera capture works on mobile browser
5. Malware scanning rejects infected files
6. EXIF metadata stripped from uploaded images
7. Documents accessible only through signed URLs (5 min expiry)
8. Every document view/download creates audit record
9. Version history preserved when document replaced
10. Missing document request message generated correctly
11. **Review Gate SECURITY-02 passed**

## Definition of Done

- [ ] Checklist engine generates correct document lists from rules
- [ ] Secure upload pipeline (pre-signed URL → upload → scan → strip → store)
- [ ] Document status workflow operational
- [ ] Version management working
- [ ] Signed URL download with audit logging
- [ ] Mobile camera capture functional
- [ ] Request message generation
- [ ] Seed data: common document types and sample checklist rules
- [ ] RLS on all document tables
- [ ] All security tests passing
- [ ] **Review Gate SECURITY-02 passed**

## Risks

- ClamAV integration complexity — may need a sidecar container
- Large file uploads on poor mobile networks — need chunked/resumable approach
- MinIO configuration for signed URL compatibility

## Files Expected to Change/Create

```
backend/app/modules/documents/
  __init__.py, router.py, service.py, checklist_engine.py, storage.py, processing.py, models.py, schemas.py
backend/app/workers/document_tasks.py
backend/app/shared/storage.py
backend/migrations/versions/014..018
backend/tests/test_documents.py, test_checklist_engine.py, test_document_security.py
backend/seed/seed_document_types.py

frontend/src/features/documents/
  DocumentChecklist.tsx, FileUploader.tsx, DocumentCard.tsx, DocumentViewer.tsx,
  RequestMessageModal.tsx, VersionHistory.tsx

docker-compose.yml (add ClamAV sidecar)
```
