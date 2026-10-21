import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import { isEligibleForTelecallerAllocation } from '../../shared/lib/leadQueues'
import { JAI_MOCK_USERS } from '../../shared/lib/mockDatabase'
import './AllocateToTelecallerPage.css'

interface TelecallerUser {
  id: string
  name: string
  role: string
  is_active: boolean
}

export function AllocateToTelecallerPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkTelecallerId, setBulkTelecallerId] = useState('')
  const [rowTelecallerMap, setRowTelecallerMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Filter selectable active telecallers
  const telecallers: TelecallerUser[] = useMemo(() => {
    return JAI_MOCK_USERS.filter((u) => u.role === 'telecaller' && u.is_active)
  }, [])

  const loadLeads = useCallback(async () => {
    setLoading(true)
    try {
      const allCases = await api.get<any[]>('/cases')
      const raw = Array.isArray(allCases) ? allCases : []
      // Use single source of truth queue selector
      const eligible = raw.filter(isEligibleForTelecallerAllocation)
      setLeads(eligible)
      setSelectedIds([])
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'Failed to load leads awaiting allocation.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLeads()

    const handleUpdate = () => {
      loadLeads()
    }
    window.addEventListener('dsa_os_cases_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('dsa_os_cases_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [loadLeads])

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(leads.map((l) => l.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  // Single Row Assignment
  const handleAssignSingle = async (leadId: string) => {
    const targetTc = rowTelecallerMap[leadId] || telecallers[0]?.id
    if (!targetTc) {
      alert('Please select a telecaller.')
      return
    }

    setIsSubmitting(true)
    setFeedback(null)
    try {
      const res = await api.post<any>('/cases/assign', {
        case_ids: [leadId],
        telecaller_id: targetTc,
        abort_if_assigned: true,
      })

      const failure = res?.results?.find((r: any) => !r.success)
      if (failure) {
        setFeedback({ type: 'error', message: failure.message })
      } else {
        setFeedback({
          type: 'success',
          message: `Successfully allocated lead to ${res.telecaller_name || 'telecaller'}.`,
        })
      }
      loadLeads()
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'Assignment transaction failed.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Bulk Multi-Select Assignment
  const handleAssignBulk = async () => {
    if (selectedIds.length === 0) {
      alert('Please select at least one lead to assign.')
      return
    }
    const targetTc = bulkTelecallerId || telecallers[0]?.id
    if (!targetTc) {
      alert('Please select a telecaller.')
      return
    }

    setIsSubmitting(true)
    setFeedback(null)
    try {
      const res = await api.post<any>('/cases/assign', {
        case_ids: selectedIds,
        telecaller_id: targetTc,
        abort_if_assigned: true,
      })

      const successCount = res?.results?.filter((r: any) => r.success).length || res?.assigned_count || 0
      const failed = res?.results?.filter((r: any) => !r.success) || []

      if (failed.length > 0) {
        setFeedback({
          type: 'error',
          message: `Allocated ${successCount} leads. ${failed.length} leads failed (e.g., ${failed[0]?.message}).`,
        })
      } else {
        setFeedback({
          type: 'success',
          message: `Successfully allocated ${successCount} leads to ${res.telecaller_name || 'telecaller'}.`,
        })
      }
      loadLeads()
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'Bulk assignment failed.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="allocate-telecaller-container">
      <div className="allocate-header">
        <div className="allocate-title-group">
          <h1>Allocate to Telecaller</h1>
          <p>Assign incoming unassigned leads to active telecallers for calling runs.</p>
        </div>

        <div className="allocate-stats-bar">
          <div className="allocate-stat-badge">
            <span>Awaiting Allocation:</span>
            <span className="allocate-stat-value">{leads.length}</span>
          </div>
          <div className="allocate-stat-badge">
            <span>Active Telecallers:</span>
            <span className="allocate-stat-value">{telecallers.length}</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`alert-result-banner ${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      {/* Bulk Action Controls */}
      {leads.length > 0 && selectedIds.length > 0 && (
        <div className="bulk-actions-banner">
          <div>
            <strong>{selectedIds.length}</strong> leads selected for bulk allocation.
          </div>
          <div className="bulk-actions-controls">
            <select
              className="telecaller-select-dropdown"
              value={bulkTelecallerId || telecallers[0]?.id}
              onChange={(e) => setBulkTelecallerId(e.target.value)}
              aria-label="Select Telecaller for bulk assignment"
            >
              {telecallers.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.name}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAssignBulk}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Assigning...' : `Assign Selected (${selectedIds.length})`}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
          Loading eligible unassigned leads...
        </div>
      ) : leads.length === 0 ? (
        <div className="empty-queue-card">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto var(--space-md) auto', color: '#94a3b8' }}>
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <h3>All Caught Up!</h3>
          <p>There are no unassigned leads awaiting telecaller allocation at this moment.</p>
        </div>
      ) : (
        <div className="allocate-table-wrapper">
          <table className="allocate-table" aria-label="Allocate to Telecaller Queue">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.length === leads.length && leads.length > 0}
                    onChange={handleSelectAll}
                    aria-label="Select all leads"
                  />
                </th>
                <th>Customer Name & Reference</th>
                <th>Mobile</th>
                <th>Product / Loan</th>
                <th>Requested Amount</th>
                <th>Source / Partner</th>
                <th>Intake Date</th>
                <th>Assign To</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const customerName = lead.primary_applicant_name || lead.applicant_name || 'Borrower'
                const mobile = lead.primary_applicant_mobile || lead.mobile || '—'
                const product = (lead.product_type || lead.product || 'Used Car').replace('_', ' ')
                const amount = lead.loan_amount_requested || lead.applied_loan_amount || 0
                const source = lead.referral_partner_name || lead.source_name || 'Direct Walk-in'
                const intakeDate = lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today'
                const isChecked = selectedIds.includes(lead.id)

                return (
                  <tr key={lead.id} className={isChecked ? 'is-selected-row' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelect(lead.id)}
                        aria-label={`Select lead ${lead.case_no || lead.id}`}
                      />
                    </td>
                    <td>
                      <div className="lead-name-cell">{customerName}</div>
                      <div className="lead-id-sub">{lead.case_no || lead.id}</div>
                    </td>
                    <td>{mobile}</td>
                    <td style={{ textTransform: 'capitalize' }}>{product}</td>
                    <td style={{ fontWeight: 600 }}>{formatINR(amount)}</td>
                    <td>{source}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{intakeDate}</td>
                    <td>
                      <select
                        className="telecaller-select-dropdown"
                        value={rowTelecallerMap[lead.id] || telecallers[0]?.id}
                        onChange={(e) =>
                          setRowTelecallerMap((prev) => ({ ...prev, [lead.id]: e.target.value }))
                        }
                        aria-label={`Select telecaller for ${customerName}`}
                      >
                        {telecallers.map((tc) => (
                          <option key={tc.id} value={tc.id}>
                            {tc.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="row-assign-actions">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleAssignSingle(lead.id)}
                          disabled={isSubmitting}
                        >
                          Assign
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AllocateToTelecallerPage
