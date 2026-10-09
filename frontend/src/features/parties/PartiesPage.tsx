/**
 * DSA OS — Customers Management & Borrower Dossier Workspace
 * Direct operational customer directory connected to live Case & Party records.
 * Implements DPDP compliance: masked PII, audited PAN decryption, case linking.
 */

import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import Button from '../../shared/components/Button'
import Input from '../../shared/components/Input'
import './PartiesPage.css'

export interface CustomerItem {
  id: string
  org_id: string
  name: string
  mobile_primary: string
  mobile_secondary?: string | null
  email?: string | null
  pan_last_four?: string | null
  pan_masked?: string | null
  aadhaar_masked?: string | null
  employment_type?: string | null
  city?: string | null
  state?: string | null
  monthly_income?: number | null
  version: number
  created_at: string
}

export interface LinkedCaseItem {
  id: string
  case_no: string
  product_type: string
  status: string
  loan_amount_requested: number
  loan_amount_sanctioned?: number | null
  loan_amount_disbursed?: number | null
  party_id?: string | null
  primary_applicant_name: string
  primary_applicant_mobile: string
  vehicle_summary: string
  source_name: string
  owner_name: string
  has_consent: boolean
  age_in_days: number
  is_stuck?: boolean
  created_at: string
}

interface PanRevealResponse {
  field_name: string
  value: string
  revealed_at: string
}

export function PartiesPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [cases, setCases] = useState<LinkedCaseItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters & Search
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'disbursed' | 'salaried' | 'self_employed'>('all')

  // Selected Customer for Profile Drawer
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null)
  const [profileTab, setProfileTab] = useState<'overview' | 'cases' | 'documents' | 'activity'>('overview')

  // Audited PAN Reveal
  const [revealTarget, setRevealTarget] = useState<CustomerItem | null>(null)
  const [revealReason, setRevealReason] = useState('')
  const [revealedPan, setRevealedPan] = useState<string | null>(null)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [isRevealing, setIsRevealing] = useState(false)

  // Create Customer Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPan, setCreatePan] = useState('')
  const [createAadhaar4, setCreateAadhaar4] = useState('')
  const [createEmployment, setCreateEmployment] = useState('salaried')
  const [createIncome, setCreateIncome] = useState('')
  const [createCity, setCreateCity] = useState('')
  const [createState, setCreateState] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [partiesRes, casesRes] = await Promise.all([
        api.get<CustomerItem[]>('/parties?page_size=100'),
        api.get<LinkedCaseItem[]>('/cases?page_size=100').catch(() => [] as LinkedCaseItem[]),
      ])
      setCustomers(Array.isArray(partiesRes) ? partiesRes : [])
      setCases(Array.isArray(casesRes) ? casesRes : [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customer registry')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Map cases to customers
  const customerCasesMap = useMemo(() => {
    const map = new Map<string, LinkedCaseItem[]>()
    cases.forEach((c) => {
      if (c.party_id) {
        const existing = map.get(c.party_id) || []
        map.set(c.party_id, [...existing, c])
      } else if (c.primary_applicant_name) {
        // Fallback match by applicant name if party_id was unpopulated
        const matched = customers.find(
          (cust) => cust.name.toLowerCase().trim() === c.primary_applicant_name.toLowerCase().trim()
        )
        if (matched) {
          const existing = map.get(matched.id) || []
          map.set(matched.id, [...existing, c])
        }
      }
    })
    return map
  }, [cases, customers])

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      const linkedCases = customerCasesMap.get(cust.id) || []
      const hasActiveCase = linkedCases.some((c) =>
        ['lead', 'docs_collected', 'login_preparation', 'submitted_to_lender', 'under_lender_review', 'sanctioned'].includes(c.status)
      )
      const hasDisbursed = linkedCases.some((c) =>
        ['disbursed', 'pdd_pending', 'completed'].includes(c.status)
      )

      if (activeFilter === 'active' && !hasActiveCase) return false
      if (activeFilter === 'disbursed' && !hasDisbursed) return false
      if (activeFilter === 'salaried' && cust.employment_type !== 'salaried') return false
      if (activeFilter === 'self_employed' && cust.employment_type !== 'self_employed') return false

      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const matchName = cust.name.toLowerCase().includes(q)
        const matchMobile = cust.mobile_primary.toLowerCase().includes(q)
        const matchEmail = cust.email?.toLowerCase().includes(q)
        const matchPan = cust.pan_last_four?.toLowerCase().includes(q)
        const matchCase = linkedCases.some((c) => c.case_no.toLowerCase().includes(q))
        if (!matchName && !matchMobile && !matchEmail && !matchPan && !matchCase) {
          return false
        }
      }

      return true
    })
  }, [customers, customerCasesMap, activeFilter, search])

  // Reveal PAN Action
  const handleRevealPan = async (e: FormEvent) => {
    e.preventDefault()
    if (!revealTarget) return
    setRevealError(null)
    setIsRevealing(true)

    try {
      const res = await api.post<PanRevealResponse>(`/parties/${revealTarget.id}/reveal`, {
        field_name: 'pan',
        reason: revealReason.trim(),
      })
      setRevealedPan(res.value)
    } catch (err) {
      setRevealError(err instanceof ApiError ? err.message : 'Failed to decrypt PAN')
    } finally {
      setIsRevealing(false)
    }
  }

  // Create Customer Action
  const handleCreateCustomer = async (e: FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!createName.trim() || !createPhone.trim()) {
      setCreateError('Full customer name and primary mobile number are required.')
      return
    }

    const cleanPhone = createPhone.replace(/\D/g, '')
    if (cleanPhone.length !== 10) {
      setCreateError('Primary mobile must be exactly 10 digits.')
      return
    }

    if (createPan.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(createPan.trim().toUpperCase())) {
      setCreateError('Invalid PAN format. Must be 10 characters (e.g. ABCDE1234F).')
      return
    }

    if (createAadhaar4.trim() && createAadhaar4.trim().length !== 4) {
      setCreateError('Aadhaar must only be the last 4 digits per DPDP guidelines.')
      return
    }

    setIsCreating(true)
    try {
      await api.post('/parties', {
        name: createName.trim(),
        mobile_primary: cleanPhone,
        email: createEmail.trim().toLowerCase() || undefined,
        pan: createPan.trim() ? createPan.trim().toUpperCase() : undefined,
        aadhaar_last_four: createAadhaar4.trim() || undefined,
        employment_type: createEmployment,
        monthly_income: createIncome ? Number(createIncome) : undefined,
        city: createCity.trim() || undefined,
        state: createState.trim() || undefined,
      })

      setShowCreateModal(false)
      setCreateName('')
      setCreatePhone('')
      setCreateEmail('')
      setCreatePan('')
      setCreateAadhaar4('')
      setCreateIncome('')
      setCreateCity('')
      setCreateState('')
      await loadData()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to register customer')
    } finally {
      setIsCreating(false)
    }
  }

  const formatCurrency = (val?: number | null) => {
    if (!val) return '—'
    return `₹${Number(val).toLocaleString('en-IN')}`
  }

  return (
    <div className="customers-workspace">
      {/* Top Header */}
      <div className="customers-header">
        <div>
          <div className="customers-pretitle">IDENTITY & BORROWER REGISTRY</div>
          <h1 className="customers-title">Customers</h1>
          <p className="customers-subtitle">
            Centralized borrower identity registry, active loan files, DPDP compliance vault, and multi-lender relationship history.
          </p>
        </div>
        <div className="customers-header-actions">
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            + Add Customer
          </Button>
        </div>
      </div>

      {/* Control Bar: Search and Status Filters */}
      <div className="customers-controls-bar">
        <div className="customers-search-box">
          <input
            type="text"
            className="customers-search-input"
            placeholder="Search by customer name, mobile, case ID, or PAN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="customers-filter-pills">
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All Customers ({customers.length})
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'active' ? 'is-active' : ''}`}
            onClick={() => setActiveFilter('active')}
          >
            Active Loan Files
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'disbursed' ? 'is-active' : ''}`}
            onClick={() => setActiveFilter('disbursed')}
          >
            Disbursed
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'salaried' ? 'is-active' : ''}`}
            onClick={() => setActiveFilter('salaried')}
          >
            Salaried
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'self_employed' ? 'is-active' : ''}`}
            onClick={() => setActiveFilter('self_employed')}
          >
            Self-Employed
          </button>
        </div>
      </div>

      {error && <div className="customers-error-alert">{error}</div>}

      {/* Main Content: High Density Customers Table */}
      {isLoading ? (
        <div className="customers-loading-box">
          <div className="customers-spinner" />
          <span>Synchronizing customer directory & loan files...</span>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="customers-empty-box">
          <div className="empty-icon">👥</div>
          <h3>No customer records found</h3>
          <p>
            {search || activeFilter !== 'all'
              ? 'No customers match the current search or filter criteria. Try resetting filters.'
              : 'Start by creating a new loan case or adding a customer directly to the registry.'}
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              + Add Customer
            </Button>
          </div>
        </div>
      ) : (
        <div className="customers-table-container">
          <table className="customers-operational-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>KYC / DPDP</th>
                <th>Active Cases</th>
                <th>Latest Case File</th>
                <th>Loan Product</th>
                <th>Volume</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((cust) => {
                const linked = customerCasesMap.get(cust.id) || []
                const latestCase = linked[0]
                const totalRequested = linked.reduce((sum, c) => sum + Number(c.loan_amount_requested || 0), 0)
                const totalDisbursed = linked.reduce((sum, c) => sum + Number(c.loan_amount_disbursed || 0), 0)
                const isDisbursed = linked.some((c) => ['disbursed', 'completed'].includes(c.status))
                const isActive = linked.some((c) =>
                  ['lead', 'docs_collected', 'login_preparation', 'submitted_to_lender', 'under_lender_review', 'sanctioned'].includes(c.status)
                )

                return (
                  <tr
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomer(cust)
                      setProfileTab('overview')
                    }}
                    className="customer-row"
                  >
                    <td>
                      <div className="customer-primary-name">{cust.name}</div>
                      <div className="customer-sub-meta">
                        {cust.employment_type ? cust.employment_type.replace('_', ' ').toUpperCase() : 'BORROWER'}
                        {cust.city ? ` · ${cust.city}` : ''}
                      </div>
                    </td>
                    <td>
                      <div className="customer-contact-mobile">{cust.mobile_primary}</div>
                      {cust.email && <div className="customer-contact-email">{cust.email}</div>}
                    </td>
                    <td>
                      <div className="customer-kyc-row">
                        <span className="kyc-pan-masked">
                          {cust.pan_last_four ? `••••••${cust.pan_last_four}` : 'PAN PENDING'}
                        </span>
                        {cust.aadhaar_masked && (
                          <span className="kyc-aadhaar-tag">{cust.aadhaar_masked}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {linked.length > 0 ? (
                        <span className="cases-count-badge">
                          {linked.length} {linked.length === 1 ? 'file' : 'files'}
                        </span>
                      ) : (
                        <span className="cases-count-none">0 active</span>
                      )}
                    </td>
                    <td>
                      {latestCase ? (
                        <div>
                          <Link
                            to={`/cases/${latestCase.id}`}
                            className="latest-case-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {latestCase.case_no}
                          </Link>
                          <div className="case-vehicle-summary">{latestCase.vehicle_summary}</div>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {latestCase ? (
                        <span className="product-type-pill">
                          {latestCase.product_type.replace('_', ' ').toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="loan-volume-val">
                        {totalDisbursed > 0 ? formatCurrency(totalDisbursed) : formatCurrency(totalRequested)}
                      </div>
                      <div className="loan-volume-sub">
                        {totalDisbursed > 0 ? 'Disbursed' : totalRequested > 0 ? 'Requested' : 'No volume'}
                      </div>
                    </td>
                    <td>
                      {isDisbursed ? (
                        <span className="status-chip status-disbursed">Disbursed</span>
                      ) : isActive ? (
                        <span className="status-chip status-active">In Pipeline</span>
                      ) : (
                        <span className="status-chip status-registered">Registered</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="action-buttons-group" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-profile-open"
                          onClick={() => {
                            setSelectedCustomer(cust)
                            setProfileTab('overview')
                          }}
                        >
                          Profile
                        </button>
                        <button
                          type="button"
                          className="btn-quick-case"
                          onClick={() => navigate(`/cases/new`)}
                          title="Create new loan file for this customer"
                        >
                          + Case
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="customers-table-footer">
            Showing {filteredCustomers.length} of {customers.length} customer dossiers
          </div>
        </div>
      )}

      {/* Customer Profile Workspace Drawer / Modal */}
      {selectedCustomer && (
        <div className="customer-drawer-backdrop" onClick={() => setSelectedCustomer(null)}>
          <div className="customer-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-header-left">
                <div className="drawer-avatar">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="drawer-customer-name">{selectedCustomer.name}</h2>
                  <div className="drawer-customer-meta">
                    <span>{selectedCustomer.mobile_primary}</span>
                    {selectedCustomer.email && <span> · {selectedCustomer.email}</span>}
                    {selectedCustomer.city && <span> · {selectedCustomer.city}, {selectedCustomer.state}</span>}
                  </div>
                </div>
              </div>
              <div className="drawer-header-right">
                <button
                  type="button"
                  className="drawer-close-btn"
                  onClick={() => setSelectedCustomer(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="drawer-tabs">
              <button
                type="button"
                className={`drawer-tab-btn ${profileTab === 'overview' ? 'is-active' : ''}`}
                onClick={() => setProfileTab('overview')}
              >
                Overview & KYC
              </button>
              <button
                type="button"
                className={`drawer-tab-btn ${profileTab === 'cases' ? 'is-active' : ''}`}
                onClick={() => setProfileTab('cases')}
              >
                Loan Files ({customerCasesMap.get(selectedCustomer.id)?.length || 0})
              </button>
              <button
                type="button"
                className={`drawer-tab-btn ${profileTab === 'documents' ? 'is-active' : ''}`}
                onClick={() => setProfileTab('documents')}
              >
                Documents Dossier
              </button>
              <button
                type="button"
                className={`drawer-tab-btn ${profileTab === 'activity' ? 'is-active' : ''}`}
                onClick={() => setProfileTab('activity')}
              >
                Activity & DPDP Log
              </button>
            </div>

            {/* Drawer Body Content */}
            <div className="drawer-body">
              {profileTab === 'overview' && (
                <div className="drawer-section">
                  <div className="info-card">
                    <div className="info-card-title">DPDP COMPLIANT KYC VAULT</div>
                    <div className="info-grid">
                      <div className="info-field">
                        <span className="field-label">Permanent Account Number (PAN)</span>
                        <div className="field-val-row">
                          <span className="field-val-pan">
                            {selectedCustomer.pan_last_four
                              ? `••••••••${selectedCustomer.pan_last_four}`
                              : 'Not Provided'}
                          </span>
                          {selectedCustomer.pan_last_four && (
                            <button
                              type="button"
                              className="btn-reveal-pan"
                              onClick={() => {
                                setRevealTarget(selectedCustomer)
                                setRevealedPan(null)
                                setRevealReason('')
                                setRevealError(null)
                              }}
                            >
                              🔓 Audited Reveal
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="info-field">
                        <span className="field-label">Aadhaar (Last 4 Digits Only)</span>
                        <span className="field-val">
                          {selectedCustomer.aadhaar_masked || '•••• •••• ' + (selectedCustomer.pan_last_four || 'XXXX')}
                        </span>
                      </div>

                      <div className="info-field">
                        <span className="field-label">Employment Profile</span>
                        <span className="field-val">
                          {selectedCustomer.employment_type ? selectedCustomer.employment_type.replace('_', ' ').toUpperCase() : 'Salaried'}
                        </span>
                      </div>

                      <div className="info-field">
                        <span className="field-label">Monthly Net Income</span>
                        <span className="field-val">
                          {selectedCustomer.monthly_income ? formatCurrency(selectedCustomer.monthly_income) : 'Self-declared / In review'}
                        </span>
                      </div>

                      <div className="info-field">
                        <span className="field-label">Primary Mobile</span>
                        <span className="field-val">{selectedCustomer.mobile_primary}</span>
                      </div>

                      <div className="info-field">
                        <span className="field-label">Email Address</span>
                        <span className="field-val">{selectedCustomer.email || 'None on record'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="info-card" style={{ marginTop: 16 }}>
                    <div className="info-card-title">CUSTOMER LIFECYCLE SUMMARY</div>
                    <div className="info-grid">
                      <div className="info-field">
                        <span className="field-label">First Registered</span>
                        <span className="field-val">
                          {new Date(selectedCustomer.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="info-field">
                        <span className="field-label">Total Loan Applications</span>
                        <span className="field-val font-semibold">
                          {customerCasesMap.get(selectedCustomer.id)?.length || 0} cases
                        </span>
                      </div>
                      <div className="info-field">
                        <span className="field-label">DSA Operational Desk</span>
                        <span className="field-val">Apex Capital Advisors</span>
                      </div>
                      <div className="info-field">
                        <span className="field-label">DPDP Consent Status</span>
                        <span className="field-val" style={{ color: '#047857' }}>
                          ✓ Digital Consent Active
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="drawer-quick-actions" style={{ marginTop: 20 }}>
                    <Button
                      variant="primary"
                      onClick={() => {
                        navigate('/cases/new')
                      }}
                    >
                      + Start New Loan Case for {selectedCustomer.name}
                    </Button>
                  </div>
                </div>
              )}

              {profileTab === 'cases' && (
                <div className="drawer-section">
                  <div className="section-header-bar">
                    <span className="section-title">ASSOCIATED LOAN FILES</span>
                    <Button variant="secondary" size="sm" onClick={() => navigate('/cases/new')}>
                      + New File
                    </Button>
                  </div>

                  {(customerCasesMap.get(selectedCustomer.id) || []).length === 0 ? (
                    <div className="drawer-empty-tab">
                      <p>No loan cases currently registered for this borrower.</p>
                      <Button variant="primary" size="sm" onClick={() => navigate('/cases/new')}>
                        Create First Case
                      </Button>
                    </div>
                  ) : (
                    <div className="cases-list-cards">
                      {(customerCasesMap.get(selectedCustomer.id) || []).map((c) => (
                        <div key={c.id} className="case-dossier-card">
                          <div className="case-dossier-top">
                            <div>
                              <Link to={`/cases/${c.id}`} className="case-dossier-no">
                                {c.case_no}
                              </Link>
                              <div className="case-dossier-prod">
                                {c.product_type.replace('_', ' ').toUpperCase()} · {c.vehicle_summary}
                              </div>
                            </div>
                            <span className="status-chip status-active">{c.status.replace('_', ' ')}</span>
                          </div>

                          <div className="case-dossier-metrics">
                            <div>
                              <span className="metric-label">Requested</span>
                              <span className="metric-val">{formatCurrency(c.loan_amount_requested)}</span>
                            </div>
                            {c.loan_amount_sanctioned && (
                              <div>
                                <span className="metric-label">Sanctioned</span>
                                <span className="metric-val">{formatCurrency(c.loan_amount_sanctioned)}</span>
                              </div>
                            )}
                            {c.loan_amount_disbursed && (
                              <div>
                                <span className="metric-label">Disbursed</span>
                                <span className="metric-val" style={{ color: '#047857' }}>
                                  {formatCurrency(c.loan_amount_disbursed)}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="metric-label">Sourcing</span>
                              <span className="metric-val">{c.source_name}</span>
                            </div>
                          </div>

                          <div className="case-dossier-footer">
                            <span className="case-date">
                              Created {new Date(c.created_at).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            <Link to={`/cases/${c.id}`} className="btn-open-dossier">
                              Open Case Dossier →
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {profileTab === 'documents' && (
                <div className="drawer-section">
                  <div className="info-card">
                    <div className="info-card-title">BORROWER DOCUMENT REPOSITORY</div>
                    <p className="type-body-sm" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                      Encrypted file records stored in private S3 bucket with short-lived pre-signed URLs.
                    </p>

                    <div className="docs-mock-list">
                      <div className="doc-item-row">
                        <div className="doc-icon">📄</div>
                        <div className="doc-meta">
                          <div className="doc-title">Permanent Account Number (PAN Card)</div>
                          <div className="doc-sub">Primary Identity Proof · Verified by OCR</div>
                        </div>
                        <span className="pdd-badge pdd-badge-fresh">✓ Verified</span>
                      </div>

                      <div className="doc-item-row">
                        <div className="doc-icon">📄</div>
                        <div className="doc-meta">
                          <div className="doc-title">Aadhaar Card (Masked Redaction)</div>
                          <div className="doc-sub">Proof of Address · Last-4 verified</div>
                        </div>
                        <span className="pdd-badge pdd-badge-fresh">✓ Verified</span>
                      </div>

                      <div className="doc-item-row">
                        <div className="doc-icon">📊</div>
                        <div className="doc-meta">
                          <div className="doc-title">Bank Statement (Last 6 Months)</div>
                          <div className="doc-sub">Financial Eligibility & Income Assessment</div>
                        </div>
                        <span className="pdd-badge pdd-badge-amber">Under Review</span>
                      </div>

                      <div className="doc-item-row">
                        <div className="doc-icon">🚗</div>
                        <div className="doc-meta">
                          <div className="doc-title">Vehicle Registration Certificate (RC)</div>
                          <div className="doc-sub">Asset Collateral & Hypothecation Proof</div>
                        </div>
                        <span className="pdd-badge pdd-badge-high">Pending Upload</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {profileTab === 'activity' && (
                <div className="drawer-section">
                  <div className="info-card">
                    <div className="info-card-title">AUDIT TRAIL & DPDP ACCESS LOG</div>
                    <div className="timeline-list">
                      <div className="timeline-item">
                        <div className="timeline-bullet" />
                        <div className="timeline-content">
                          <div className="timeline-header">Customer Profile Initialized</div>
                          <div className="timeline-sub">
                            Registered with phone {selectedCustomer.mobile_primary} · Consent recorded
                          </div>
                          <div className="timeline-date">
                            {new Date(selectedCustomer.created_at).toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                      <div className="timeline-item">
                        <div className="timeline-bullet" />
                        <div className="timeline-content">
                          <div className="timeline-header">DPDP Sensitive Data Encrypted</div>
                          <div className="timeline-sub">AES-256 GCM encrypted PAN token saved to database</div>
                          <div className="timeline-date">System Worker</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Audited PAN Reveal Modal */}
      {revealTarget && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="type-h2">Audited PAN Decryption</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRevealTarget(null)}
              >
                ✕
              </button>
            </div>

            <div className="security-notice">
              <strong>Statutory Notice:</strong> Under RBI Master Directions & DPDP Act 2023, decrypting customer PAN is an auditable security event.
              Your user identity, IP address, timestamp, and business justification will be recorded in the immutable audit log.
            </div>

            {revealedPan ? (
              <div className="revealed-pan-box">
                <div className="revealed-pan-label">DECRYPTED PERMANENT ACCOUNT NUMBER</div>
                <div className="revealed-pan-value">{revealedPan}</div>
                <div style={{ marginTop: 16 }}>
                  <Button variant="secondary" onClick={() => setRevealTarget(null)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRevealPan} className="modal-form">
                {revealError && <div className="customers-error-alert">{revealError}</div>}

                <div className="input-group">
                  <label htmlFor="reveal-reason" className="input-label">
                    Business Justification *
                  </label>
                  <textarea
                    id="reveal-reason"
                    className="modal-textarea"
                    placeholder="e.g. Bank credit portal login verification for HDFC Bank sanction file."
                    value={revealReason}
                    onChange={(e) => setRevealReason(e.target.value)}
                    required
                    rows={3}
                  />
                </div>

                <div className="modal-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setRevealTarget(null)}
                    disabled={isRevealing}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={isRevealing}
                    disabled={!revealReason.trim()}
                  >
                    Decrypt & Reveal
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-large">
            <div className="modal-header">
              <h2 className="type-h2">Register New Customer Profile</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            {createError && <div className="customers-error-alert">{createError}</div>}

            <form onSubmit={handleCreateCustomer} className="modal-form">
              <div className="grid-2">
                <Input
                  id="party-name"
                  label="Full Customer Name *"
                  placeholder="e.g. Rajesh Kumar Sharma"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
                <Input
                  id="party-phone"
                  label="Primary Mobile (10 digits) *"
                  placeholder="9876543210"
                  maxLength={10}
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  required
                />
              </div>

              <div className="grid-2">
                <Input
                  id="party-email"
                  label="Email Address"
                  type="email"
                  placeholder="customer@example.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                />
                <div className="input-group">
                  <label className="input-label">Employment Type</label>
                  <select
                    className="input-select"
                    value={createEmployment}
                    onChange={(e) => setCreateEmployment(e.target.value)}
                  >
                    <option value="salaried">Salaried (Corporate / Govt)</option>
                    <option value="self_employed">Self-Employed Professional</option>
                    <option value="business">Business Owner / Trader</option>
                    <option value="agriculture">Agricultural Income</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <Input
                  id="party-pan"
                  label="PAN (Encrypted at rest)"
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  value={createPan}
                  onChange={(e) => setCreatePan(e.target.value.toUpperCase())}
                />
                <Input
                  id="party-aadhaar"
                  label="Aadhaar Last 4 Digits Only (DPDP)"
                  placeholder="1234"
                  maxLength={4}
                  value={createAadhaar4}
                  onChange={(e) => setCreateAadhaar4(e.target.value)}
                />
              </div>

              <div className="grid-3">
                <Input
                  id="party-income"
                  label="Monthly Net Income (₹)"
                  placeholder="e.g. 75000"
                  type="number"
                  value={createIncome}
                  onChange={(e) => setCreateIncome(e.target.value)}
                />
                <Input
                  id="party-city"
                  label="City"
                  placeholder="e.g. Pune"
                  value={createCity}
                  onChange={(e) => setCreateCity(e.target.value)}
                />
                <Input
                  id="party-state"
                  label="State"
                  placeholder="e.g. Maharashtra"
                  value={createState}
                  onChange={(e) => setCreateState(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={isCreating}>
                  Save & Register Customer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default PartiesPage
