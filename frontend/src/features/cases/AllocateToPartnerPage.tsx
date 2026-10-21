import { useState, useEffect, useCallback } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import {
  isEligibleForPartnerAllocation,
  type FinancingPartnerAllocation,
  type FinancingPartnerMaster,
} from '../../shared/lib/leadQueues'
import './AllocateToPartnerPage.css'

export function AllocateToPartnerPage() {
  const [activeTab, setActiveTab] = useState<'eligible' | 'active_allocations'>('eligible')
  const [eligibleLeads, setEligibleLeads] = useState<any[]>([])
  const [activeAllocations, setActiveAllocations] = useState<FinancingPartnerAllocation[]>([])
  const [financingPartners, setFinancingPartners] = useState<FinancingPartnerMaster[]>([])
  const [selectedPartnersMap, setSelectedPartnersMap] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Status update modal state
  const [editingAlloc, setEditingAlloc] = useState<FinancingPartnerAllocation | null>(null)
  const [targetStatus, setTargetStatus] = useState<'In Process' | 'Sanctioned' | 'Rejected'>('Sanctioned')
  const [sanctionAmount, setSanctionAmount] = useState<string>('')
  const [rejectionReason, setRejectionReason] = useState<string>('')
  const [correctionReason, setCorrectionReason] = useState<string>('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [casesRes, partnersRes, allocsRes] = await Promise.all([
        api.get<any[]>('/cases'),
        api.get<FinancingPartnerMaster[]>('/financing-partners'),
        api.get<FinancingPartnerAllocation[]>('/partner-allocations'),
      ])

      const rawCases = Array.isArray(casesRes) ? casesRes : []
      const rawPartners = Array.isArray(partnersRes) ? partnersRes : []
      const rawAllocs = Array.isArray(allocsRes) ? allocsRes : []

      setFinancingPartners(rawPartners.filter((p) => p.active))
      setActiveAllocations(rawAllocs)

      // Filter eligible Interested leads with 0 active allocations
      const eligible = rawCases.filter((lead) => {
        const leadAllocs = rawAllocs.filter((a) => a.leadId === lead.id)
        return isEligibleForPartnerAllocation(lead, leadAllocs)
      })
      setEligibleLeads(eligible)
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'Failed to load partner allocation data.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    const handleUpdate = () => {
      loadData()
    }
    window.addEventListener('dsa_os_cases_updated', handleUpdate)
    window.addEventListener('dsa_os_partner_allocations_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('dsa_os_cases_updated', handleUpdate)
      window.removeEventListener('dsa_os_partner_allocations_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [loadData])

  // Partner selection toggle for a lead
  const handleTogglePartner = (leadId: string, partnerId: string) => {
    setSelectedPartnersMap((prev) => {
      const current = prev[leadId] || []
      const exists = current.includes(partnerId)
      const updated = exists ? current.filter((id) => id !== partnerId) : [...current, partnerId]
      return { ...prev, [leadId]: updated }
    })
  }

  // Allocate lead to selected partners
  const handleAllocateLead = async (leadId: string) => {
    const selected = selectedPartnersMap[leadId] || []
    if (selected.length === 0) {
      alert('Please select at least one financing partner.')
      return
    }

    setIsSubmitting(true)
    setFeedback(null)
    try {
      const res = await api.post<any>(`/cases/${leadId}/allocate-partner`, {
        partner_ids: selected,
      })

      setFeedback({
        type: 'success',
        message: `Successfully allocated lead to ${res.allocations?.length || selected.length} financing partner(s). Lead stage is now "Partner Allocated".`,
      })
      setSelectedPartnersMap((prev) => {
        const updated = { ...prev }
        delete updated[leadId]
        return updated
      })
      loadData()
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'Partner allocation failed.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open Status Update Modal
  const handleOpenStatusModal = (alloc: FinancingPartnerAllocation) => {
    setEditingAlloc(alloc)
    setTargetStatus(alloc.status === 'Allocated' ? 'In Process' : 'Sanctioned')
    setSanctionAmount(alloc.sanctionAmount ? String(alloc.sanctionAmount) : String(alloc.requestedAmountSnapshot || ''))
    setRejectionReason(alloc.rejectionReason || '')
    setCorrectionReason('')
  }

  // Submit Partner Status Update
  const handleSaveStatus = async () => {
    if (!editingAlloc) return

    if (targetStatus === 'Sanctioned') {
      const parsedAmount = Number(sanctionAmount)
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        alert('Please enter a valid positive sanction amount.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      await api.patch(`/partner-allocations/${editingAlloc.id}`, {
        status: targetStatus,
        sanctionAmount: targetStatus === 'Sanctioned' ? Number(sanctionAmount) : null,
        rejectionReason: targetStatus === 'Rejected' ? rejectionReason : null,
        correctionReason: correctionReason || undefined,
      })

      setFeedback({
        type: 'success',
        message: `Successfully updated ${editingAlloc.financingPartnerName} status to "${targetStatus}".`,
      })
      setEditingAlloc(null)
      loadData()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to update partner allocation status.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="allocate-partner-container">
      <div className="partner-alloc-header">
        <div className="partner-alloc-title-group">
          <h1>Allocate to Partner</h1>
          <p>
            Distribute interested customer leads to active financing partners (Banks & NBFCs) for underwriting.
          </p>
        </div>

        <div className="allocate-stats-bar">
          <div className="allocate-stat-badge">
            <span>Awaiting Allocation:</span>
            <span className="allocate-stat-value">{eligibleLeads.length}</span>
          </div>
          <div className="allocate-stat-badge">
            <span>Active Partner Allocations:</span>
            <span className="allocate-stat-value">{activeAllocations.length}</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`alert-result-banner ${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="partner-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'eligible'}
          className={`partner-tab-btn ${activeTab === 'eligible' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('eligible')}
        >
          Interested Leads Awaiting Allocation ({eligibleLeads.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'active_allocations'}
          className={`partner-tab-btn ${activeTab === 'active_allocations' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('active_allocations')}
        >
          Active Partner Processing & Status Updates ({activeAllocations.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
          Loading partner allocation workflow...
        </div>
      ) : activeTab === 'eligible' ? (
        eligibleLeads.length === 0 ? (
          <div className="empty-queue-card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto var(--space-md) auto', color: '#94a3b8' }}>
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <h3>No Interested Leads Awaiting Allocation</h3>
            <p>Leads marked "Interested" by telecallers will automatically appear here for bank/NBFC allocation.</p>
          </div>
        ) : (
          <div className="allocate-table-wrapper">
            <table className="allocate-table" aria-label="Eligible Leads Awaiting Allocation">
              <thead>
                <tr>
                  <th>Customer Name & Lead ID</th>
                  <th>Loan Product</th>
                  <th>Requested Amount</th>
                  <th>Assigned Telecaller</th>
                  <th>Source / Referral</th>
                  <th>Interested Date</th>
                  <th>Select Financing Partner(s)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {eligibleLeads.map((lead) => {
                  const customerName = lead.primary_applicant_name || lead.applicant_name || 'Borrower'
                  const product = (lead.product_type || lead.product || 'Used Car').replace('_', ' ')
                  const amount = lead.loan_amount_requested || lead.applied_loan_amount || 0
                  const telecaller = lead.assigned_telecaller_name || 'Telecaller'
                  const source = lead.referral_partner_name || lead.source_name || 'Direct'
                  const dateLabel = lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Today'
                  const selectedPartners = selectedPartnersMap[lead.id] || []

                  return (
                    <tr key={lead.id}>
                      <td>
                        <div className="lead-name-cell">{customerName}</div>
                        <div className="lead-id-sub">{lead.case_no || lead.id}</div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{product}</td>
                      <td style={{ fontWeight: 600 }}>{formatINR(amount)}</td>
                      <td>{telecaller}</td>
                      <td>{source}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{dateLabel}</td>
                      <td>
                        <div className="partner-selection-chips">
                          {financingPartners.map((partner) => {
                            const isChecked = selectedPartners.includes(partner.id)
                            return (
                              <label
                                key={partner.id}
                                className={`partner-checkbox-chip ${isChecked ? 'is-checked' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleTogglePartner(lead.id, partner.id)}
                                  style={{ display: 'none' }}
                                />
                                <span>{partner.name}</span>
                                <span className={`partner-type-tag ${partner.type}`}>{partner.type}</span>
                              </label>
                            )
                          })}
                        </div>
                      </td>
                      <td>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleAllocateLead(lead.id)}
                          disabled={isSubmitting || selectedPartners.length === 0}
                        >
                          Allocate ({selectedPartners.length})
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Tab 2: Active Allocations Table */
        activeAllocations.length === 0 ? (
          <div className="empty-queue-card">
            <h3>No Active Allocations</h3>
            <p>Allocate interested leads to financing partners to track lender status here.</p>
          </div>
        ) : (
          <div className="allocate-table-wrapper">
            <table className="allocate-table" aria-label="Active Partner Allocations">
              <thead>
                <tr>
                  <th>Allocation ID & Partner</th>
                  <th>Lead Reference</th>
                  <th>Partner Status</th>
                  <th>Requested Amount</th>
                  <th>Sanction Amount</th>
                  <th>Allocated On</th>
                  <th>Status Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeAllocations.map((alloc) => {
                  const statusClass = alloc.status.toLowerCase().replace(/\s+/g, '-')
                  const allocDate = alloc.allocatedAt ? new Date(alloc.allocatedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
                  const statusDate = alloc.sanctionedAt || alloc.rejectedAt || alloc.statusUpdatedAt
                  const statusDateLabel = statusDate ? new Date(statusDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—'

                  return (
                    <tr key={alloc.id}>
                      <td>
                        <div className="lead-name-cell">{alloc.financingPartnerName}</div>
                        <div className="lead-id-sub">{alloc.id}</div>
                      </td>
                      <td>
                        <a href={`/cases/${alloc.leadId}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
                          {alloc.leadId}
                        </a>
                      </td>
                      <td>
                        <span className={`status-badge ${statusClass}`}>{alloc.status}</span>
                        {alloc.rejectionReason && (
                          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>
                            {alloc.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td>{formatINR(alloc.requestedAmountSnapshot)}</td>
                      <td style={{ fontWeight: 600, color: alloc.sanctionAmount ? '#15803d' : 'inherit' }}>
                        {alloc.sanctionAmount ? formatINR(alloc.sanctionAmount) : '—'}
                      </td>
                      <td>{allocDate}</td>
                      <td>{statusDateLabel}</td>
                      <td>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenStatusModal(alloc)}
                        >
                          Update Status
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Modal: Update Partner Allocation Status */}
      {editingAlloc && (
        <div className="alloc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="alloc-modal-card">
            <h2 id="modal-title">Update {editingAlloc.financingPartnerName} Status</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
              Lead: <strong>{editingAlloc.leadId}</strong> · Current Status: <strong>{editingAlloc.status}</strong>
            </p>

            <div className="alloc-field-group">
              <label htmlFor="new-status-select">Select New Status</label>
              <select
                id="new-status-select"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as any)}
              >
                <option value="In Process">In Process (Under Review)</option>
                <option value="Sanctioned">Sanctioned (Approved)</option>
                <option value="Rejected">Rejected (Declined)</option>
              </select>
            </div>

            {targetStatus === 'Sanctioned' && (
              <div className="alloc-field-group">
                <label htmlFor="sanction-amount-input">Sanction Amount (INR) *</label>
                <input
                  id="sanction-amount-input"
                  type="number"
                  placeholder="Enter sanctioned loan amount"
                  value={sanctionAmount}
                  onChange={(e) => setSanctionAmount(e.target.value)}
                  min="1"
                  required
                />
              </div>
            )}

            {targetStatus === 'Rejected' && (
              <div className="alloc-field-group">
                <label htmlFor="rejection-reason-input">Rejection Reason</label>
                <textarea
                  id="rejection-reason-input"
                  rows={2}
                  placeholder="e.g. CIBIL score below cutoff / Income ratio exceed"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            )}

            {(editingAlloc.status === 'Sanctioned' || editingAlloc.status === 'Rejected') && (
              <div className="alloc-field-group">
                <label htmlFor="correction-reason-input">Correction Reason (Admin Required) *</label>
                <input
                  id="correction-reason-input"
                  type="text"
                  placeholder="Reason for modifying terminal status"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="alloc-modal-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditingAlloc(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveStatus}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Status'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AllocateToPartnerPage
