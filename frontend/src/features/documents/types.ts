/**
 * DSA OS — Document Domain Types (Graphite Ledger)
 */

export type DocumentStatus =
  | 'requested'
  | 'quarantined'
  | 'scanning'
  | 'scan_failed'
  | 'received'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'archived'

export interface OCRExtractedField {
  field_key: string
  label: string
  value: string
  confidence: number
  status: 'extracted' | 'needs_review' | 'verified'
}

export interface OCRScanResult {
  ocr_status: string
  document_type_code: string
  pipeline_stage: string
  raw_text?: string
  fields: OCRExtractedField[]
  extracted_at: string
  confidence_avg?: number
}

export interface ChecklistItem {
  document_type_id: string
  code: string
  name: string
  group_name: string
  is_mandatory: boolean
  status: DocumentStatus
  document_id?: string | null
  file_name?: string | null
  file_size?: number | null
  version?: number | null
  uploaded_at?: string | null
  reject_reason?: string | null
  can_download: boolean
  scan_result?: OCRScanResult | null
}

export interface CaseChecklist {
  case_id: string
  missing_mandatory_count: number
  items: ChecklistItem[]
}

export interface UploadUrlResponse {
  upload_id: string
  upload_url: string
  quarantine_key: string
  expires_in_seconds: number
}

export interface DocumentItem {
  id: string
  org_id: string
  case_id?: string | null
  document_type_id: string
  file_name: string
  file_size: number
  mime_type: string
  version: number
  status: DocumentStatus
  scan_result?: OCRScanResult | null
  scan_error?: string | null
  reject_reason?: string | null
  uploaded_at: string
  can_download: boolean
}

export interface RequestMessageResponse {
  case_no: string
  customer_name: string
  message: string
  missing_count: number
}
