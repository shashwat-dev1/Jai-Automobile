import { useState, useEffect, useCallback, useMemo } from 'react'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import Button from '../../shared/components/Button'
import {
  JAI_MOCK_REFERRAL_PROFILES,
  JAI_MOCK_REFERRAL_COMMISSIONS,
  JAI_MOCK_CASES,
  MockReferralProfile,
  MockReferralCommission,
} from '../../shared/lib/mockDatabase'
import './ReferralPartnersPage.css'

export function ReferralPartnersPage() {
  const [profiles, setProfiles] = useState<MockReferralProfile[]>([])
  const [commissions, setCommissions] = useState<MockReferralCommission[]>([])
  const [selectedProfile, setSelectedProfile] = useState<MockReferralProfile | null>(null)
  const [dossierTab, setDossierTab] = useState<'leads' | 'commissions'>('leads')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending_verification'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Payment modal state
  const [payingCommission, setPayingCommission] = useState<MockReferralCommission | null>(null)
  const [utrReference, setUtrReference] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  // Add manual commission state
  const [showAddCommModal, setShowAddCommModal] = useState(false)
  const [newCommAmount, setNewCommAmount] = useState('5000')
  const [newCommBasis, setNewCommBasis] = useState('Direct Partner Incentive')
  const [newCommNotes, setNewCommNotes] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [profilesRes, commsRes] = await Promise.all([
        api.get<MockReferralProfile[]>('/referrals/profiles'),
        api.get<MockReferralCommission[]>('/referrals/commissions'),
      ])
      setProfiles(profilesRes || JAI_MOCK_REFERRAL_PROFILES)
      setCommissions(commsRes || JAI_MOCK_REFERRAL_COMMISSIONS)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load referral data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Aggregate Top KPIs
  const kpis = useMemo(() => {
    const totalPartners = profiles.length
    const totalLeads = profiles.reduce((acc, p) => acc + (p.total_leads || 0), 0)
    const interestedLeads = profiles.reduce((acc, p) => acc + (p.interested_leads || 0), 0)
    const convertedLeads = profiles.reduce((acc, p) => acc + (p.converted_leads || 0), 0)

    const pendingReviewAmount = commissions
      .filter((c) => c.status === 'pending_review')
      .reduce((acc, c) => acc + (c.amount || 0), 0)

    const approvedAmount = commissions
      .filter((c) => c.status === 'approved' || c.status === 'payable')
      .reduce((acc, c) => acc + (c.amount || 0), 0)

    const paidAmount = commissions
      .filter((c) => c.status === 'paid')
      .reduce((acc, c) => acc + (c.amount || 0), 0)

    return {
      totalPartners,
      totalLeads,
      interestedLeads,
      convertedLeads,
      pendingReviewAmount,
      approvedAmount,
      paidAmount,
    }
  }, [profiles, commissions])

  // Filtered Partners
  const filteredProfiles = profiles.filter((p) => {
    const q = search.toLowerCase().trim()
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.masked_mobile.includes(q)
    if (!matchQ) return false
    if (statusFilter !== 'all' && p.verification_status !== statusFilter) return false
    return true
  })

  // Associated leads for active dossier
  const partnerLeads = useMemo(() => {
    if (!selectedProfile) return []
    return JAI_MOCK_CASES.filter(
      (c: any) =>
        c.referral_profile_id === selectedProfile.id ||
        c.referral_partner_name === selectedProfile.name
    )
  }, [selectedProfile])

  // Associated commissions for active dossier
  const partnerCommissions = useMemo(() => {
    if (!selectedProfile) return []
    return commissions.filter((c) => c.referral_profile_id === selectedProfile.id)
  }, [selectedProfile, commissions])

  // Toggle Verification Status
  const handleToggleVerification = async (profileId: string) => {
    try {
      const updated = await api.post<MockReferralProfile>(`/referrals/profiles/${profileId}/verify`)
      if (updated) {
        setProfiles((prev) =>
          prev.map((p) => (p.id === profileId ? { ...p, verification_status: updated.verification_status } : p))
        )
        if (selectedProfile && selectedProfile.id === profileId) {
          setSelectedProfile((prev) => (prev ? { ...prev, verification_status: updated.verification_status } : null))
        }
      }
    } catch {
      alert('Failed to update verification status.')
    }
  }

  // Update Commission Status (Approve / Reject)
  const handleUpdateCommissionStatus = async (commissionId: string, newStatus: string) => {
    try {
      const updated = await api.post<MockReferralCommission>(`/referrals/commissions/${commissionId}/status`, {
        status: newStatus,
      })
      if (updated) {
        setCommissions((prev) =>
          prev.map((c) => (c.id === commissionId ? { ...c, status: updated.status } : c))
        )
      }
    } catch {
      alert('Failed to update commission status.')
    }
  }

  // Submit Payment with UTR Reference
  const handleConfirmPayment = async () => {
    if (!payingCommission) return
    if (!utrReference.trim()) {
      alert('Please enter a bank UTR / NEFT / IMPS reference identifier.')
      return
    }

    setIsProcessingPayment(true)
    try {
      const updated = await api.post<MockReferralCommission>(
        `/referrals/commissions/${payingCommission.id}/status`,
        {
          status: 'paid',
          payment_reference: utrReference.trim(),
        }
      )
      if (updated) {
        setCommissions((prev) =>
          prev.map((c) =>
            c.id === payingCommission.id
              ? {
                  ...c,
                  status: 'paid',
                  payment_reference: utrReference.trim(),
                  payment_date: new Date().toISOString().split('T')[0],
                }
              : c
          )
        )
        setPayingCommission(null)
        setUtrReference('')
      }
    } catch {
      alert('Payment recording failed. Please retry.')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  // Add Manual Commission
  const handleAddCommission = async () => {
    if (!selectedProfile) return
    const amt = Number(newCommAmount)
    if (!amt || amt <= 0) {
      alert('Please enter a valid commission amount.')
      return
    }

    try {
      const created = await api.post<MockReferralCommission>('/referrals/commissions', {
        referral_profile_id: selectedProfile.id,
        referral_partner_name: selectedProfile.name,
        amount: amt,
        basis: newCommBasis.trim(),
        notes: newCommNotes.trim(),
      })
      if (created) {
        setCommissions((prev) => [created, ...prev])
        setShowAddCommModal(false)
        setNewCommAmount('5000')
        setNewCommNotes('')
      }
    } catch {
      alert('Failed to add commission.')
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Partner Name', 'Masked Mobile', 'Status', 'Total Leads', 'Interested', 'Converted', 'Approved (INR)', 'Paid (INR)', 'Created At']
    const rows = filteredProfiles.map((p) => [
      `"${p.name}"`,
      p.masked_mobile,
      p.verification_status,
      p.total_leads,
      p.interested_leads,
      p.converted_leads,
      p.approved_commissions,
      p.paid_commissions,
      p.created_at,
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Referral_Partners_Report_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="referrals-page">
      {/* Header */}
      <div className="referrals-header">
        <div>
          <h1 className="type-h1">Referral Partners & Commissions</h1>
          <p className="type-body-md text-muted">
            Attribution, partner verification, performance analysis, and referral commission disbursements.
          </p>
        </div>
        <div className="referrals-header-actions">
          <Button variant="secondary" onClick={handleExportCSV}>
            📥 Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="referrals-kpi-grid">
        <div className="ref-kpi-card">
          <span className="ref-kpi-label">Active Partners</span>
          <span className="ref-kpi-value">{kpis.totalPartners}</span>
        </div>
        <div className="ref-kpi-card">
          <span className="ref-kpi-label">Referred Leads</span>
          <span className="ref-kpi-value text-blue">{kpis.totalLeads}</span>
        </div>
        <div className="ref-kpi-card">
          <span className="ref-kpi-label">Interested Leads</span>
          <span className="ref-kpi-value text-green">{kpis.interestedLeads}</span>
        </div>
        <div className="ref-kpi-card">
          <span className="ref-kpi-label">Pending Review</span>
          <span className="ref-kpi-value font-mono text-amber">{formatINR(kpis.pendingReviewAmount)}</span>
        </div>
        <div className="ref-kpi-card">
          <span className="ref-kpi-label">Approved Payable</span>
          <span className="ref-kpi-value font-mono text-purple">{formatINR(kpis.approvedAmount)}</span>
        </div>
        <div className="ref-kpi-card">
          <span className="ref-kpi-label">Disbursed Payouts</span>
          <span className="ref-kpi-value font-mono text-green">{formatINR(kpis.paidAmount)}</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="referrals-filter-bar">
        <div className="filter-search-box">
          <input
            type="text"
            placeholder="Search partner by name or masked mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="filter-search-input"
          />
        </div>

        <div className="filter-pill-group">
          <button
            className={`filter-pill ${statusFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Partners ({profiles.length})
          </button>
          <button
            className={`filter-pill ${statusFilter === 'verified' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('verified')}
          >
            Verified ({profiles.filter((p) => p.verification_status === 'verified').length})
          </button>
          <button
            className={`filter-pill ${statusFilter === 'pending_verification' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('pending_verification')}
          >
            Pending Verification ({profiles.filter((p) => p.verification_status !== 'verified').length})
          </button>
        </div>
      </div>

      {/* Partners Ledger Table */}
      {isLoading ? (
        <div className="referrals-loading">Loading referral directory...</div>
      ) : error ? (
        <div className="referrals-error">{error}</div>
      ) : filteredProfiles.length === 0 ? (
        <div className="referrals-empty">No referral partners match your filter criteria.</div>
      ) : (
        <div className="table-responsive-wrapper">
          <table className="referrals-table">
            <thead>
              <tr>
                <th>Partner Name</th>
                <th>Masked Mobile</th>
                <th>Verification</th>
                <th>Total Leads</th>
                <th>Interested</th>
                <th>Converted</th>
                <th>Approved (₹)</th>
                <th>Disbursed (₹)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td className="font-mono text-muted">{p.masked_mobile}</td>
                  <td>
                    <span
                      className={`status-chip ${
                        p.verification_status === 'verified' ? 'chip-verified' : 'chip-pending'
                      }`}
                    >
                      {p.verification_status === 'verified' ? 'Verified Partner' : 'Pending Verification'}
                    </span>
                  </td>
                  <td className="font-mono text-center">{p.total_leads}</td>
                  <td className="font-mono text-center text-green">{p.interested_leads}</td>
                  <td className="font-mono text-center text-blue">{p.converted_leads}</td>
                  <td className="font-mono">{formatINR(p.approved_commissions)}</td>
                  <td className="font-mono text-green">{formatINR(p.paid_commissions)}</td>
                  <td>
                    <div className="action-button-group">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedProfile(p)}
                      >
                        📂 View Dossier
                      </Button>
                      <button
                        className="toggle-verify-btn"
                        onClick={() => handleToggleVerification(p.id)}
                        title="Toggle Verification"
                      >
                        {p.verification_status === 'verified' ? 'Revoke' : 'Verify'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-Over Partner Dossier Drawer */}
      {selectedProfile && (
        <div className="dossier-backdrop" onClick={() => setSelectedProfile(null)}>
          <div className="dossier-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="dossier-header">
              <div>
                <span className="type-body-xs text-muted">Referral Partner Dossier</span>
                <h2 className="type-h2">{selectedProfile.name}</h2>
                <div className="dossier-meta-tags">
                  <span className="font-mono text-muted">Phone: {selectedProfile.masked_mobile}</span>
                  <span
                    className={`status-chip ${
                      selectedProfile.verification_status === 'verified' ? 'chip-verified' : 'chip-pending'
                    }`}
                  >
                    {selectedProfile.verification_status === 'verified' ? 'Verified' : 'Pending Review'}
                  </span>
                </div>
              </div>
              <button
                className="dossier-close-btn"
                onClick={() => setSelectedProfile(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Dossier Tabs */}
            <div className="dossier-tabs-strip">
              <button
                className={`dossier-tab-btn ${dossierTab === 'leads' ? 'is-active' : ''}`}
                onClick={() => setDossierTab('leads')}
              >
                Attributed Leads ({partnerLeads.length})
              </button>
              <button
                className={`dossier-tab-btn ${dossierTab === 'commissions' ? 'is-active' : ''}`}
                onClick={() => setDossierTab('commissions')}
              >
                Commission Records ({partnerCommissions.length})
              </button>
            </div>

            <div className="dossier-body">
              {/* Tab 1: Attributed Leads */}
              {dossierTab === 'leads' && (
                <div className="dossier-leads-view">
                  {partnerLeads.length === 0 ? (
                    <div className="dossier-empty">No leads attributed to this partner yet.</div>
                  ) : (
                    partnerLeads.map((c: any) => (
                      <div key={c.id} className="dossier-lead-card">
                        <div className="lead-card-header">
                          <span className="font-mono text-muted">{c.case_no}</span>
                          <span className="text-capitalize product-tag">{c.product_type}</span>
                        </div>
                        <h4 className="lead-applicant-name">{c.applicant_name || c.primary_applicant_name}</h4>
                        <div className="lead-meta-row">
                          <span className="font-mono">{formatINR(c.loan_amount_requested)}</span>
                          <span className="outcome-chip-small">{c.call_outcome || 'new'}</span>
                        </div>
                        <p className="type-body-xs text-muted">
                          Registered: {new Date(c.created_at).toLocaleDateString()} • Vehicle: {c.vehicle_summary || 'N/A'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 2: Commissions Ledger */}
              {dossierTab === 'commissions' && (
                <div className="dossier-commissions-view">
                  <div className="commissions-top-bar">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowAddCommModal(true)}
                    >
                      + Add Commission Entry
                    </Button>
                  </div>

                  {partnerCommissions.length === 0 ? (
                    <div className="dossier-empty">No commission entries for this partner.</div>
                  ) : (
                    partnerCommissions.map((comm) => (
                      <div key={comm.id} className="commission-item-card">
                        <div className="comm-top-row">
                          <span className="comm-amount font-mono">{formatINR(comm.amount)}</span>
                          <span className={`comm-status-badge status-${comm.status}`}>
                            {comm.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="comm-basis"><strong>Basis:</strong> {comm.basis}</p>
                        {comm.case_no && (
                          <p className="type-body-xs font-mono text-muted">Linked File: {comm.case_no} ({comm.applicant_name})</p>
                        )}
                        {comm.notes && (
                          <p className="type-body-xs text-muted">Notes: {comm.notes}</p>
                        )}
                        {comm.payment_reference && (
                          <p className="type-body-xs text-green font-mono">
                            UTR Reference: {comm.payment_reference} ({comm.payment_date})
                          </p>
                        )}

                        {/* Lifecycle Action Buttons */}
                        <div className="comm-actions-bar">
                          {comm.status === 'pending_review' && (
                            <>
                              <button
                                className="comm-btn btn-approve"
                                onClick={() => handleUpdateCommissionStatus(comm.id, 'approved')}
                              >
                                Approve
                              </button>
                              <button
                                className="comm-btn btn-reject"
                                onClick={() => handleUpdateCommissionStatus(comm.id, 'rejected')}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {(comm.status === 'approved' || comm.status === 'payable') && (
                            <button
                              className="comm-btn btn-pay"
                              onClick={() => setPayingCommission(comm)}
                            >
                              💸 Record Payout (Enter UTR)
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Payment UTR Modal */}
      {payingCommission && (
        <div className="modal-backdrop" onClick={() => setPayingCommission(null)}>
          <div className="comm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="type-h3">Record Commission Disbursement</h3>
            <p className="type-body-sm text-muted">
              Partner: <strong>{payingCommission.referral_partner_name}</strong> • Amount: <strong>{formatINR(payingCommission.amount)}</strong>
            </p>

            <div className="form-group" style={{ margin: '1rem 0' }}>
              <label className="type-title-xs">Bank UTR / Transaction Reference Identifier *</label>
              <input
                type="text"
                placeholder="e.g. UTR-HDFC-991823"
                value={utrReference}
                onChange={(e) => setUtrReference(e.target.value.toUpperCase())}
                className="filter-search-input font-mono"
                autoFocus
              />
              <span className="type-body-xs text-muted">
                Mandatory reference for financial audit trail and ledger reconciliation.
              </span>
            </div>

            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setPayingCommission(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmPayment}
                disabled={!utrReference.trim() || isProcessingPayment}
              >
                {isProcessingPayment ? 'Recording...' : 'Confirm Disbursed Payout'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Manual Commission Modal */}
      {showAddCommModal && selectedProfile && (
        <div className="modal-backdrop" onClick={() => setShowAddCommModal(false)}>
          <div className="comm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="type-h3">Add Referral Commission Entry</h3>
            <p className="type-body-sm text-muted">For Partner: {selectedProfile.name}</p>

            <div className="form-group" style={{ margin: '0.75rem 0' }}>
              <label className="type-title-xs">Commission Amount (₹) *</label>
              <input
                type="number"
                min="500"
                step="500"
                value={newCommAmount}
                onChange={(e) => setNewCommAmount(e.target.value)}
                className="filter-search-input font-mono"
              />
            </div>

            <div className="form-group" style={{ margin: '0.75rem 0' }}>
              <label className="type-title-xs">Calculation Basis / Rule *</label>
              <input
                type="text"
                placeholder="e.g. 1.0% Disbursed Value or Flat ₹5,000 Incentive"
                value={newCommBasis}
                onChange={(e) => setNewCommBasis(e.target.value)}
                className="filter-search-input"
              />
            </div>

            <div className="form-group" style={{ margin: '0.75rem 0' }}>
              <label className="type-title-xs">Notes / Approval Remarks</label>
              <input
                type="text"
                placeholder="e.g. Special campaign promotion incentive"
                value={newCommNotes}
                onChange={(e) => setNewCommNotes(e.target.value)}
                className="filter-search-input"
              />
            </div>

            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setShowAddCommModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAddCommission}>
                Add Commission Entry
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
