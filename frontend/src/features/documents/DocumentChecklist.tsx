/**
 * DSA OS — DocumentChecklist Component (Graphite Ledger)
 * Grouped operational checklist, quarantine indicators, short-lived signed downloads,
 * and missing document request message generator.
 */

import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import { FileUploaderModal } from './FileUploaderModal'
import { RequestMessageModal } from './RequestMessageModal'
import { RejectDocumentModal } from './RejectDocumentModal'
import { DocumentExtractionReviewModal } from './DocumentExtractionReviewModal'
import type { CaseChecklist, ChecklistItem, DocumentItem, RequestMessageResponse } from './types'
import './DocumentChecklist.css'

interface Props {
  caseId: string
  caseNo: string
  customerName: string
}

export function DocumentChecklist({ caseId, caseNo, customerName }: Props) {
  const [checklist, setChecklist] = useState<CaseChecklist | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Upload modal state
  const [activeUploadItem, setActiveUploadItem] = useState<ChecklistItem | null>(null)

  // Reject modal state
  const [activeRejectItem, setActiveRejectItem] = useState<ChecklistItem | null>(null)

  // OCR Review modal state
  const [activeOcrItem, setActiveOcrItem] = useState<ChecklistItem | null>(null)

  // Request message modal state
  const [reqMsgData, setReqMsgData] = useState<RequestMessageResponse | null>(null)
  const [isGeneratingMsg, setIsGeneratingMsg] = useState(false)

  const loadChecklist = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await api.get<CaseChecklist>(`/cases/${caseId}/checklist`)
      setChecklist(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to query document checklist')
    } finally {
      setIsLoading(false)
    }
  }, [caseId])

  useEffect(() => {
    loadChecklist()
  }, [loadChecklist])

  const handleDownload = (item: ChecklistItem) => {
    if (!item.document_id) return
    window.open(`/api/v1/documents/${item.document_id}/content`, '_blank', 'noopener,noreferrer')
  }

  const handleVerify = async (item: ChecklistItem) => {
    if (!item.document_id) return
    try {
      await api.patch<DocumentItem>(`/documents/${item.document_id}/status`, {
        status: 'verified',
      })
      await loadChecklist()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to verify document')
    }
  }

  const handleRejectConfirm = async (reason: string) => {
    if (!activeRejectItem?.document_id) return
    await api.patch<DocumentItem>(`/documents/${activeRejectItem.document_id}/status`, {
      status: 'rejected',
      reason,
    })
    await loadChecklist()
  }

  const handleGenerateMessage = async () => {
    setIsGeneratingMsg(true)
    try {
      const res = await api.post<RequestMessageResponse>(
        `/cases/${caseId}/documents/request-message`,
        {}
      )
      setReqMsgData(res)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to generate request message')
    } finally {
      setIsGeneratingMsg(false)
    }
  }

  // Group items by group_name
  const groupedItems = checklist?.items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const group = item.group_name || 'General'
    if (!acc[group]) acc[group] = []
    acc[group].push(item)
    return acc
  }, {}) || {}

  return (
    <div className="doc-checklist-container">
      <div className="doc-checklist-header">
        <div>
          <h2 className="type-h2">Document Checklist & Verification Hub</h2>
          <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Quarantine validation pipeline with ClamAV scanning, EXIF stripping, and signed downloads.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGenerateMessage}
          loading={isGeneratingMsg}
        >
          📱 Generate WhatsApp / SMS Request
        </Button>
      </div>

      {checklist && checklist.missing_mandatory_count > 0 && (
        <div className="missing-alert-banner">
          <span className="warning-icon" aria-hidden="true">⚠️</span>
          <span>
            <strong>{checklist.missing_mandatory_count} mandatory document(s)</strong> are currently missing or require re-upload before login to lender.
          </span>
        </div>
      )}

      {error && <div className="upload-error-alert">{error}</div>}

      {isLoading ? (
        <div className="doc-loading">Evaluating case rules and checklist...</div>
      ) : Object.keys(groupedItems).length === 0 ? (
        <div className="doc-empty">No document rules configured for this case product.</div>
      ) : (
        <div className="doc-groups">
          {Object.entries(groupedItems).map(([groupName, items]) => (
            <div key={groupName} className="doc-group-card">
              <div className="doc-group-header">
                <span className="doc-group-title">{groupName} Documents</span>
                <span className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {items.filter((i) => i.status === 'verified').length} / {items.length} verified
                </span>
              </div>

              <div className="doc-items-table-wrap">
                <table className="doc-items-table">
                  <thead>
                    <tr>
                      <th>Document Type</th>
                      <th>Status</th>
                      <th>Version & File Details</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.document_type_id}>
                        <td>
                          <div className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            {item.name}
                          </div>
                          {item.is_mandatory && (
                            <span className="mandatory-tag">Mandatory</span>
                          )}
                          {item.reject_reason && (
                            <div className="reject-note">
                              Reason: {item.reject_reason}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`doc-status-badge status-${item.status}`}>
                            {item.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          {item.file_name ? (
                            <div>
                              <div className="type-mono-sm font-semibold">{item.file_name}</div>
                              <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                v{item.version} • {item.file_size ? `${(item.file_size / 1024).toFixed(1)} KB` : ''}
                                {item.uploaded_at && ` • ${new Date(item.uploaded_at).toLocaleDateString('en-IN')}`}
                              </div>
                            </div>
                          ) : (
                            <span className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                              Not yet uploaded
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-buttons-wrap">
                            {item.document_id && (
                              <button
                                type="button"
                                className="action-text-btn"
                                onClick={() => handleDownload(item)}
                                title="Open clean canonical document in browser"
                              >
                                View File
                              </button>
                            )}

                            {(item.status === 'under_review' || item.status === 'received' || item.scan_result) && item.document_id && (
                              <button
                                type="button"
                                className="action-text-btn"
                                style={{ color: 'var(--color-accent-dark)', fontWeight: 600 }}
                                onClick={() => setActiveOcrItem(item)}
                                title="Review extracted OCR fields and verify against document"
                              >
                                🔍 Review OCR / Verify
                              </button>
                            )}

                            <button
                              type="button"
                              className="action-text-btn"
                              onClick={() => setActiveUploadItem(item)}
                            >
                              {item.file_name ? 'Re-upload' : 'Upload'}
                            </button>

                            {(item.status === 'received' || item.status === 'under_review') && (
                              <>
                                <button
                                  type="button"
                                  className="action-text-btn verify-btn"
                                  onClick={() => handleVerify(item)}
                                >
                                  Quick Verify
                                </button>
                                <button
                                  type="button"
                                  className="action-text-btn reject-btn"
                                  onClick={() => setActiveRejectItem(item)}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uploader Modal */}
      {activeUploadItem && (
        <FileUploaderModal
          caseId={caseId}
          item={activeUploadItem}
          isOpen={true}
          onClose={() => setActiveUploadItem(null)}
          onSuccess={(doc) => {
            const itemToReview: ChecklistItem = {
              ...activeUploadItem,
              document_id: doc.id,
              file_name: doc.file_name,
              file_size: doc.file_size,
              version: doc.version,
              status: doc.status,
              scan_result: doc.scan_result,
              can_download: true,
            }
            setActiveUploadItem(null)
            loadChecklist()
            setActiveOcrItem(itemToReview)
          }}
        />
      )}

      {/* OCR Extraction Review Modal */}
      {activeOcrItem && activeOcrItem.document_id && (
        <DocumentExtractionReviewModal
          documentId={activeOcrItem.document_id}
          documentName={activeOcrItem.file_name || activeOcrItem.name}
          documentType={activeOcrItem.name}
          scanResult={activeOcrItem.scan_result}
          isOpen={true}
          onClose={() => setActiveOcrItem(null)}
          onVerified={() => {
            setActiveOcrItem(null)
            loadChecklist()
          }}
        />
      )}

      {/* Request Message Modal */}
      {reqMsgData && (
        <RequestMessageModal
          caseNo={reqMsgData.case_no || caseNo}
          customerName={reqMsgData.customer_name || customerName}
          message={reqMsgData.message}
          missingCount={reqMsgData.missing_count}
          isOpen={true}
          onClose={() => setReqMsgData(null)}
        />
      )}

      {/* Reject Reason Modal */}
      {activeRejectItem && (
        <RejectDocumentModal
          documentName={activeRejectItem.name}
          isOpen={true}
          onClose={() => setActiveRejectItem(null)}
          onConfirm={handleRejectConfirm}
        />
      )}
    </div>
  )
}
