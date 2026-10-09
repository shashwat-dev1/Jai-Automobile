import React from 'react'
import { formatINR } from '../../shared/lib/formatters'
import StatusChip from '../../shared/components/StatusChip'
import Button from '../../shared/components/Button'
import type { LenderApplication } from './types'

interface ApplicationComparisonModalProps {
  applications: LenderApplication[]
  isOpen: boolean
  onClose: () => void
}

export const ApplicationComparisonModal: React.FC<ApplicationComparisonModalProps> = ({
  applications,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 900, width: '90%' }}>
        <div className="modal-header">
          <div>
            <h2 className="type-h2">Multi-Bank Application Comparison (FR-LAP-003)</h2>
            <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
              Side-by-side evaluation of sanction terms across partner lenders.
            </p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>×</button>
        </div>

        {applications.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No bank applications submitted yet for this file.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', margin: '16px 0' }}>
            <table className="comparison-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-hover, #f8fafc)', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Lender</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Sanction Amount</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ROI (% p.a.)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Tenure</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Margin Money</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Disbursed</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      background: app.is_winning ? 'rgba(34, 197, 94, 0.08)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {app.lender_name || 'Bank Partner'}
                      </div>
                      <div className="type-mono-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        Ref: {app.login_ref || 'Pending'}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <StatusChip status={app.status} />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      {app.sanction_amount ? formatINR(app.sanction_amount) : '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {app.sanction_rate ? `${app.sanction_rate}%` : '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {app.sanction_tenure_months ? `${app.sanction_tenure_months} mo` : '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {app.sanction_margin_money ? formatINR(app.sanction_margin_money) : '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                      {app.disbursal_amount ? formatINR(app.disbursal_amount) : '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {app.is_winning ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            background: 'rgba(34, 197, 94, 0.2)',
                            color: '#4ade80',
                            borderRadius: 4,
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          ★ WINNING
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
