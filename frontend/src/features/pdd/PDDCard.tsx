import React from 'react'
import { Link } from 'react-router-dom'
import Button from '../../shared/components/Button'
import { PDD_STATUS_CONFIG, type PDDItem, type PDDStatus } from './types'
import './PDDCard.css'

interface PDDCardProps {
  item: PDDItem
  onOpenStatusModal: (item: PDDItem, status: PDDStatus) => void
}

export const PDDCard: React.FC<PDDCardProps> = ({ item, onOpenStatusModal }) => {
  const statusCfg = PDD_STATUS_CONFIG[item.status] || PDD_STATUS_CONFIG.pending

  const getBucketStyle = (bucket: string) => {
    switch (bucket) {
      case '0_7':
        return { color: '#4ade80', bg: 'rgba(34, 197, 94, 0.15)', label: '0-7d (Fresh)' }
      case '8_15':
        return { color: '#facc15', bg: 'rgba(234, 179, 8, 0.15)', label: '8-15d (Amber)' }
      case '16_30':
        return { color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)', label: '16-30d (High)' }
      case '30_plus':
        return { color: '#f87171', bg: 'rgba(220, 38, 38, 0.2)', label: '30+d (Critical)' }
      default:
        return { color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.15)', label: '' }
    }
  }

  const bucketInfo = getBucketStyle(item.ageing_bucket)

  return (
    <div className={`pdd-card ${item.is_overdue ? 'is-overdue' : ''}`}>
      <div className="pdd-card-header">
        <div>
          <div className="pdd-title">{item.title}</div>
          <div className="pdd-case-row">
            {item.case_no && (
              <Link to={`/cases/${item.case_id}`} className="pdd-case-link font-semibold">
                {item.case_no}
              </Link>
            )}
            {item.lender_name && <span>• Bank: {item.lender_name}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span
            className="pdd-status-chip"
            style={{ color: statusCfg.color, background: statusCfg.bg }}
          >
            {statusCfg.label}
          </span>
          <span
            className="pdd-bucket-chip"
            style={{ color: bucketInfo.color, background: bucketInfo.bg }}
          >
            {bucketInfo.label}
          </span>
        </div>
      </div>

      <div className="pdd-meta-grid">
        <div>
          <span className="meta-label">Due Date:</span>
          <span className={`meta-value ${item.is_overdue ? 'overdue-text' : ''}`}>
            {item.due_date} {item.is_overdue && '⚠ OVERDUE'}
          </span>
        </div>
        <div>
          <span className="meta-label">Ageing:</span>
          <span className="meta-value font-mono">{item.ageing_days} days</span>
        </div>
        {item.lender_acknowledgement_ref && (
          <div style={{ gridColumn: 'span 2' }}>
            <span className="meta-label">Reference / POD:</span>
            <span className="meta-value font-mono">{item.lender_acknowledgement_ref}</span>
          </div>
        )}
      </div>

      {item.rejection_reason && (
        <div className="pdd-rejection-alert">
          <strong>Bank Discrepancy:</strong> {item.rejection_reason}
        </div>
      )}

      {/* Action Buttons */}
      <div className="pdd-card-actions">
        {item.status === 'pending' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenStatusModal(item, 'collected')}
          >
            Mark Collected 📥
          </Button>
        )}

        {item.status === 'collected' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenStatusModal(item, 'sent_to_lender')}
          >
            Dispatch to Bank 📤
          </Button>
        )}

        {item.status === 'sent_to_lender' && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onOpenStatusModal(item, 'acknowledged_by_lender')}
            >
              Bank Ack ✓
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenStatusModal(item, 'rejected')}
              style={{ color: '#f87171' }}
            >
              Deficient ✕
            </Button>
          </>
        )}

        {item.status === 'rejected' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenStatusModal(item, 'collected')}
          >
            Re-collect from Customer 🔄
          </Button>
        )}

        {item.status === 'acknowledged_by_lender' && (
          <span className="pdd-done-tag">✓ Completed</span>
        )}
      </div>
    </div>
  )
}
