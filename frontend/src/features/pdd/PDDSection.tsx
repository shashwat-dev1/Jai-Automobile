import React, { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { PDDCard } from './PDDCard'
import { PDDStatusModal } from './PDDStatusModal'
import type { PDDItem, PDDStatus } from './types'

interface PDDSectionProps {
  caseId: string
  applicationId?: string
}

export const PDDSection: React.FC<PDDSectionProps> = ({ caseId, applicationId }) => {
  const [items, setItems] = useState<PDDItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Status modal
  const [selectedItem, setSelectedItem] = useState<PDDItem | null>(null)
  const [targetStatus, setTargetStatus] = useState<PDDStatus | null>(null)
  const [showStatusModal, setShowStatusModal] = useState(false)

  const loadPDDItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      let data: PDDItem[] = []
      if (applicationId) {
        data = await api.get<PDDItem[]>(`/cases/${caseId}/applications/${applicationId}/pdd`)
      } else {
        const board = await api.get<{ items: PDDItem[] }>(`/pdd`)
        data = board.items.filter((it) => it.case_id === caseId)
      }
      setItems(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load PDD deliverables')
    } finally {
      setIsLoading(false)
    }
  }, [caseId, applicationId])

  useEffect(() => {
    loadPDDItems()
  }, [loadPDDItems])

  const handleOpenStatusModal = (item: PDDItem, status: PDDStatus) => {
    setSelectedItem(item)
    setTargetStatus(status)
    setShowStatusModal(true)
  }

  const completedCount = items.filter((it) => it.status === 'acknowledged_by_lender').length

  return (
    <div className="pdd-section">
      <div className="dossier-card-header">
        <div>
          <h2 className="dossier-card-title">Post-Disbursal Documents (PDD)</h2>
          <p className="type-body-xs" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Mandatory deliverables required by bank post-disbursal (RC, Insurance, Form 34).
          </p>
        </div>
        {items.length > 0 && (
          <span
            className="type-mono-xs"
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: completedCount === items.length ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.15)',
              color: completedCount === items.length ? '#4ade80' : '#facc15',
              fontWeight: 600,
            }}
          >
            {completedCount} / {items.length} Completed
          </span>
        )}
      </div>

      {error && <div className="alert-error" style={{ margin: '12px 0' }}>{error}</div>}

      {isLoading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading post-disbursal checklist...
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: '16px', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 4, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          PDD checklist will generate automatically when the winning lender disburses the loan file.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {items.map((item) => (
            <PDDCard key={item.id} item={item} onOpenStatusModal={handleOpenStatusModal} />
          ))}
        </div>
      )}

      <PDDStatusModal
        item={selectedItem}
        targetStatus={targetStatus}
        isOpen={showStatusModal}
        onClose={() => {
          setShowStatusModal(false)
          setSelectedItem(null)
          setTargetStatus(null)
        }}
        onSuccess={loadPDDItems}
      />
    </div>
  )
}
