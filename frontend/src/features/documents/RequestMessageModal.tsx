/**
 * DSA OS — RequestMessageModal (FR-DOC-007)
 * Displays copyable WhatsApp/email request message for missing mandatory documents.
 */

import { useState } from 'react'
import Button from '../../shared/components/Button'
import './RequestMessageModal.css'

interface Props {
  caseNo: string
  customerName: string
  message: string
  missingCount: number
  isOpen: boolean
  onClose: () => void
}

export function RequestMessageModal({
  caseNo,
  customerName,
  message,
  missingCount,
  isOpen,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // fallback
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="req-msg-card">
        <div className="req-msg-header">
          <div>
            <h2 className="type-h2">Document Request Message</h2>
            <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Case: {caseNo} • {customerName} • {missingCount} pending mandatory document(s)
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="req-msg-body">
          <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Copy and send this pre-composed message to the customer via WhatsApp, SMS, or email:
          </p>
          <textarea
            className="req-msg-textarea type-mono-sm"
            readOnly
            rows={8}
            value={message}
          />
        </div>

        <div className="req-msg-actions">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={handleCopy}>
            {copied ? '✓ Copied to Clipboard!' : 'Copy to Clipboard'}
          </Button>
        </div>
      </div>
    </div>
  )
}
