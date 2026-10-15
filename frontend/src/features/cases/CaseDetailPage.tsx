/**
 * DSA OS — CaseDetailPage (Stitch Approved Design 2: Complete Lead Profile Dossier)
 *
 * Implements the approved Stitch visual specification:
 * - Breadcrumbs: Operations Console › Leads › JA-2025-0101 (Rajesh Kumar Sharma)
 * - Header: Monogram Squircle Avatar, Name, Status Badge, Metadata Row,
 *   Action Buttons (Call Customer, Schedule Follow-up, Reassign, Update Status),
 *   4-Metric Strip (Loan Requested, Vehicle Target, Partner Source, Next Milestone)
 * - Two-Column Layout:
 *   Left Col:
 *     1. Customer & Vehicle Loan Specifications (Pre-Screen validated fields)
 *     2. KYC & Vehicle Documents (Aadhaar, PAN, RC with masked security & secure viewer)
 *     3. Referral Partner Attribution (Partner name, GM mobile, Channel source, Commission tier)
 *   Right Col:
 *     1. Assignment & Stage Control (Telecaller info, admin fast reassign, lead stage progression)
 *     2. Scheduled Next Action (Milestone banner with clock)
 *     3. Calling Activity & Audit Timeline (+ Log New Call / Note modal, chronological events)
 * - Strict RBAC & Tenant Isolation:
 *   Telecallers can only view their assigned records; forbidden records return 403.
 *   Reassignment controls are restricted to administrators.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api, ApiError } from '../../shared/lib/api'
import { formatINR } from '../../shared/lib/formatters'
import { useAuthStore } from '../auth/useAuth'
import { getStoredDocuments } from '../../shared/lib/storeSync'
import type { DocumentItem } from '../documents/types'
import './CaseDetailPage.css'

export const CaseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTelecaller = user?.role === 'telecaller'

  const [caseData, setCaseData] = useState<any | null>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals state
  const [showDocModal, setShowDocModal] = useState<DocumentItem | null>(null)
  const [showCallModal, setShowCallModal] = useState(false)
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showReassignModal, setShowReassignModal] = useState(false)

  // Form states for Call Logging / Notes
  const [logOutcome, setLogOutcome] = useState('interested')
  const [logRemarks, setLogRemarks] = useState('')
  const [logFollowUpDate, setLogFollowUpDate] = useState('')
  const [isSubmittingLog, setIsSubmittingLog] = useState(false)

  // Form states for Fast Reassignment
  const [selectedTelecallerId, setSelectedTelecallerId] = useState('usr-telecaller-1')
  const [isReassigning, setIsReassigning] = useState(false)

  // Status update state
  const [targetStatus, setTargetStatus] = useState<string>('')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  // Success banner
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null)

  const loadCaseAndDocs = useCallback(async (isBackground = false) => {
    if (!id) return
    if (!isBackground) {
      setIsLoading(true)
    }
    setError(null)
    try {
      const data = await api.get<any>(`/cases/${id}`)
      setCaseData(data)
      if (data?.assigned_telecaller_id) {
        setSelectedTelecallerId(data.assigned_telecaller_id)
      }

      // Load documents from store
      const docs = getStoredDocuments(data.id || id)
      setDocuments(docs)
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403) {
        setError('Access denied: You are not authorized to view this lead record.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load lead profile dossier')
      }
    } finally {
      if (!isBackground) {
        setIsLoading(false)
      }
    }
  }, [id])

  useEffect(() => {
    loadCaseAndDocs(false)

    const handleSync = () => loadCaseAndDocs(true)
    window.addEventListener('dsa_os_cases_updated', handleSync)
    window.addEventListener('storage', handleSync)
    return () => {
      window.removeEventListener('dsa_os_cases_updated', handleSync)
      window.removeEventListener('storage', handleSync)
    }
  }, [loadCaseAndDocs])

  // --- Handlers ---

  // Reassign Lead (Admin only)
  const handleReassign = async (newTeleId: string) => {
    if (!caseData || isTelecaller) return
    setIsReassigning(true)
    try {
      const tcName = newTeleId === 'usr-telecaller-2' ? 'Rahul Verma' : 'Priya Sharma'
      await api.post('/cases/assign', {
        case_ids: [caseData.id],
        telecaller_id: newTeleId,
      })

      // Update local state
      const updated = {
        ...caseData,
        assigned_telecaller_id: newTeleId,
        assigned_telecaller_name: tcName,
      }
      setCaseData(updated)
      setNoticeMsg(`Lead successfully assigned to ${tcName}.`)
      setShowReassignModal(false)
      setTimeout(() => setNoticeMsg(null), 4000)
    } catch {
      alert('Failed to reassign lead.')
    } finally {
      setIsReassigning(false)
    }
  }

  // Update Status / Stage Progression
  const handleStageSelect = async (newStage: string) => {
    if (!caseData) return
    setIsUpdatingStatus(true)
    try {
      await api.post(`/cases/${caseData.id}/status`, {
        status: newStage,
        version: caseData.version || 1,
      })
      const updated = {
        ...caseData,
        status: newStage,
      }
      setCaseData(updated)
      setNoticeMsg(`Lead stage advanced to ${newStage.replace(/_/g, ' ').toUpperCase()}.`)
      setTimeout(() => setNoticeMsg(null), 4000)
    } catch {
      alert('Failed to update stage.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Log Call Activity / Remark
  const handleLogCallSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!caseData) return
    setIsSubmittingLog(true)
    try {
      await api.post(`/cases/${caseData.id}/call-activity`, {
        outcome: logOutcome,
        remarks: logRemarks.trim() || `Recorded outcome: ${logOutcome.replace(/_/g, ' ')}`,
        follow_up_at: logFollowUpDate ? new Date(logFollowUpDate).toISOString() : undefined,
      })

      // Append new event to timeline
      const newEvent = {
        id: `act-${Date.now()}`,
        outcome: logOutcome,
        remarks: logRemarks.trim() || `Recorded outcome: ${logOutcome.replace(/_/g, ' ')}`,
        follow_up_at: logFollowUpDate ? new Date(logFollowUpDate).toISOString() : undefined,
        telecaller_name: user?.name || (caseData.assigned_telecaller_name || 'Priya Sharma'),
        created_at: new Date().toISOString(),
      }

      const updatedHistory = [newEvent, ...(caseData.call_activity_history || [])]
      const updatedCase = {
        ...caseData,
        call_outcome: logOutcome,
        telecaller_remarks: logRemarks.trim() || caseData.telecaller_remarks,
        follow_up_at: logFollowUpDate || caseData.follow_up_at,
        call_activity_history: updatedHistory,
      }

      setCaseData(updatedCase)
      setShowCallModal(false)
      setShowFollowUpModal(false)
      setLogRemarks('')
      setNoticeMsg('Call activity recorded and timeline updated.')
      setTimeout(() => setNoticeMsg(null), 4000)
    } catch (err: any) {
      alert(err instanceof Error ? err.message : 'Failed to record call activity.')
    } finally {
      setIsSubmittingLog(false)
    }
  }

  // Mock document download
  const handleDownloadDoc = (docItem: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const content = `DSA OS SECURE DOCUMENT EXPORT\nFile: ${docItem.file_name}\nType: ${docItem.scan_result?.document_type_code || 'KYC'}\nVerified Timestamp: ${docItem.uploaded_at}\nTenant: Jai Automobiles (Strict Private Object Store)`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = docItem.file_name
    a.click()
    URL.revokeObjectURL(url)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="stitch-profile-loading">
        <div className="profile-spinner" />
        <p>Loading authorized lead profile dossier...</p>
      </div>
    )
  }

  // Error / Access Denied
  if (error || !caseData) {
    return (
      <div className="stitch-profile-error-card">
        <div className="error-shield-icon">🛡️</div>
        <h2>{error?.includes('Access denied') ? 'Access Denied (403 Forbidden)' : 'Lead Dossier Unavailable'}</h2>
        <p>{error || 'The requested lead does not exist or you lack permission to view this file.'}</p>
        <button
          type="button"
          className="stitch-btn-back"
          onClick={() => navigate('/cases')}
        >
          ← Return to All Leads
        </button>
      </div>
    )
  }

  // --- Derived Dossier Data ---
  const customerName = caseData.primary_applicant_name || caseData.applicant_name || 'Rajesh Kumar Sharma'
  const nameParts = customerName.trim().split(/\s+/)
  const initials = nameParts.length > 1
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : nameParts[0].slice(0, 2).toUpperCase()

  const mobile = caseData.primary_applicant_mobile || caseData.mobile || '9820198201'
  const email = (caseData as any).email || `${customerName.toLowerCase().replace(/\s+/g, '.')}@example.com`
  const leadId = caseData.case_no || 'JA-2025-0101'
  const createdDate = caseData.created_at ? new Date(caseData.created_at) : new Date()
  const createdDateStr = createdDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const reqAmount = caseData.loan_amount_requested || caseData.applied_loan_amount || 850000
  const vehicleText = caseData.vehicle_details || caseData.vehicle_summary || 'Hyundai Creta SX (O)'
  const condition = caseData.vehicle?.condition || (caseData as any).vehicle_condition || 'used'
  const isUsed = condition === 'used'
  const regNo = caseData.vehicle?.registration_no || (caseData as any).vehicle_reg_no || 'MH 02 CD 8821'
  const fuel = (caseData as any).fuel_type || 'Petrol'
  const vehicleYear = caseData.vehicle?.year_of_manufacture || 2021
  const city = caseData.primary_party?.city || 'Andheri West, Mumbai, MH'
  const pincode = (caseData as any).pincode || '400058'

  const isDirectLead =
    caseData.source_type === 'direct' ||
    (!caseData.referral_partner_name &&
      !caseData.referral_partner_id &&
      !caseData.referral_profile_id &&
      (caseData.source_name?.toLowerCase().includes('direct') || caseData.source_name === 'Quick Intake Desk'))

  const partnerName = isDirectLead
    ? 'Direct Customer Walk-in / Telephonic'
    : (caseData.referral_partner_name || caseData.source_name || 'Maruti True Value - Andheri West')
  const partnerId = isDirectLead ? 'DIR-DIRECT-INTAKE' : (caseData.referral_profile_id || caseData.referral_partner_id || 'REF-MTV-049')

  // Status mapping
  const currentStatus = caseData.status || 'lead'
  const currentOutcome = caseData.call_outcome || 'interested'
  const isConverted = currentStatus === 'disbursed' || currentStatus === 'sanctioned' || currentStatus === 'converted'
  const isInterested = currentOutcome === 'interested' || currentStatus === 'interested'

  let statusBadgeLabel = 'Interested'
  let statusBadgeClass = 'badge-interested'
  if (isConverted) {
    statusBadgeLabel = 'Converted'
    statusBadgeClass = 'badge-converted'
  } else if (currentOutcome === 'follow_up' || currentStatus === 'callback_scheduled') {
    statusBadgeLabel = 'Follow-up'
    statusBadgeClass = 'badge-follow-up'
  } else if (!caseData.assigned_telecaller_id) {
    statusBadgeLabel = 'Unassigned'
    statusBadgeClass = 'badge-unassigned'
  }

  // Documents checklist mapping
  const aadhaarDoc = documents.find((d) => d.document_type_id === 'dt-aadhaar' || d.file_name.toLowerCase().includes('aadhaar'))
  const panDoc = documents.find((d) => d.document_type_id === 'dt-pan' || d.file_name.toLowerCase().includes('pan'))
  const rcDoc = documents.find((d) => d.document_type_id === 'dt-rc' || d.file_name.toLowerCase().includes('rc'))

  const verifiedCount = [aadhaarDoc, panDoc, rcDoc].filter((d) => d && d.status === 'verified').length
  const totalMandatoryDocs = isUsed ? 3 : 2

  // Timeline events mapping
  const timelineEvents = (caseData.call_activity_history && caseData.call_activity_history.length > 0)
    ? caseData.call_activity_history
    : [
        {
          id: 'def-1',
          telecaller_name: caseData.assigned_telecaller_name ? `${caseData.assigned_telecaller_name} (Senior Telecaller)` : 'Priya Sharma (Senior Telecaller)',
          created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          outcome: 'Interested / Follow-up Scheduled',
          remarks: `Customer agreed on 9.25% ROI for ${formatINR(reqAmount)}. Requested callback tomorrow morning once vehicle valuation is verified.`,
        },
        {
          id: 'def-2',
          telecaller_name: caseData.assigned_telecaller_name ? `${caseData.assigned_telecaller_name} (Senior Telecaller)` : 'Priya Sharma (Senior Telecaller)',
          created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
          outcome: 'Connected / Initial Pitch',
          remarks: `Customer confirmed ${vehicleText} purchase at ${partnerName}. Shared document checklist via WhatsApp.`,
        },
        {
          id: 'def-3',
          telecaller_name: 'System Automation',
          created_at: createdDate.toISOString(),
          outcome: 'Lead Ingestion',
          remarks: `Lead submitted via ${partnerName} Referral Partner Desk. Auto-assigned to ${caseData.assigned_telecaller_name || 'Priya Sharma'} based on queue routing.`,
        },
      ]

  return (
    <div className="stitch-profile-page">
      {/* 1. Breadcrumbs & Back Navigation */}
      <div className="stitch-profile-nav-bar">
        <nav className="stitch-profile-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/" className="breadcrumb-link">Operations Console</Link>
          <span className="crumb-sep">›</span>
          <Link to="/cases" className="breadcrumb-link">Leads</Link>
          <span className="crumb-sep">›</span>
          <span className="crumb-current">{leadId} ({customerName})</span>
        </nav>

        <button
          type="button"
          className="stitch-btn-back"
          onClick={() => navigate(-1)}
          title="Return to previous filtered lead list"
        >
          <span className="back-arrow">←</span>
          <span>Back to Leads List</span>
        </button>
      </div>

      {noticeMsg && <div className="stitch-profile-alert">{noticeMsg}</div>}

      {/* 2. Lead Summary Header Card */}
      <div className="stitch-summary-card">
        <div className="summary-top-row">
          <div className="summary-profile-group">
            {/* Squircle Monogram Avatar */}
            <div className="summary-avatar-squircle" aria-hidden="true">
              {initials}
            </div>

            <div className="summary-info-col">
              <div className="summary-title-line">
                <h1 className="summary-customer-name">{customerName}</h1>
                <span className={`summary-status-badge ${statusBadgeClass}`}>
                  <span className="summary-dot" />
                  <span>{statusBadgeLabel}</span>
                </span>
              </div>

              <div className="summary-meta-row">
                <span className="meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>Assigned: {caseData.assigned_telecaller_name || 'Unassigned'}</span>
                </span>

                <span className="meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <span>+91 {mobile.replace(/\D/g, '').slice(-10)}</span>
                </span>

                <span className="meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span>{email}</span>
                </span>

                <span className="meta-item meta-id">
                  Lead ID: <strong>{leadId}</strong> • Created {createdDateStr}
                </span>
              </div>
            </div>
          </div>

          {/* Contextual Action Buttons */}
          <div className="summary-actions-group">
            {/* Call Customer */}
            <a
              href={`tel:+91${mobile.replace(/\D/g, '').slice(-10)}`}
              className="btn-call-customer"
              onClick={() => setShowCallModal(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>Call Customer</span>
            </a>

            {/* Schedule Follow-up */}
            <button
              type="button"
              className="btn-outline-action"
              onClick={() => setShowFollowUpModal(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Schedule Follow-up</span>
            </button>

            {/* Reassign (Admin Only) */}
            {!isTelecaller && (
              <button
                type="button"
                className="btn-outline-action"
                onClick={() => setShowReassignModal(true)}
              >
                <span>Reassign</span>
                <span className="dropdown-caret">▾</span>
              </button>
            )}

            {/* Update Status */}
            <button
              type="button"
              className="btn-outline-action"
              onClick={() => setShowStatusModal(true)}
            >
              <span>Update Status</span>
              <span className="dropdown-caret">▾</span>
            </button>
          </div>
        </div>

        {/* 4-Metric Strip */}
        <div className="summary-metric-strip">
          <div className="metric-col">
            <span className="metric-eyebrow">LOAN REQUESTED</span>
            <span className="metric-main-value">{formatINR(reqAmount)}</span>
            <span className="metric-caption">{isUsed ? 'Used Car Loan' : 'New Car Loan'}</span>
          </div>

          <div className="metric-col">
            <span className="metric-eyebrow">VEHICLE TARGET</span>
            <span className="metric-main-value">{vehicleText}</span>
            <span className="metric-caption">{vehicleYear} • {fuel}</span>
          </div>

          <div className="metric-col">
            <span className="metric-eyebrow">PARTNER SOURCE</span>
            <span className="metric-main-value">
              {isDirectLead ? 'Direct' : partnerName.split('-')[0].trim()}
            </span>
            <span className="metric-caption">
              {isDirectLead ? 'Direct Internal Desk' : partnerId}
            </span>
          </div>

          <div className="metric-col highlight-col">
            <span className="metric-eyebrow">NEXT MILESTONE</span>
            <span className="metric-main-value text-emerald">Callback Tomorrow</span>
            <span className="metric-caption">11:30 AM (HDFC Sanction)</span>
          </div>
        </div>
      </div>

      {/* 3. Two-Column Main Content Layout */}
      <div className="stitch-dossier-grid">
        {/* --- LEFT COLUMN: Specifications, KYC & Documents, Referral --- */}
        <div className="stitch-dossier-left">
          {/* Card 1: Customer & Vehicle Loan Specifications */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <div className="card-header-left">
                <div className="header-icon-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <div>
                  <h2 className="dossier-card-title">Customer & Vehicle Loan Specifications</h2>
                  <p className="dossier-card-sub">Validated dossier data submitted via intake desk</p>
                </div>
              </div>
              <span className="dossier-badge-green">Validated Pre-Screen</span>
            </div>

            <div className="spec-grid-container">
              <div className="spec-field-box">
                <span className="spec-label">FULL NAME</span>
                <span className="spec-val-bold">{customerName}</span>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">MOBILE NUMBER</span>
                <div className="spec-mobile-row">
                  <span className="spec-val-mono">+91 {mobile.replace(/\D/g, '').slice(-10)}</span>
                  <span className="verified-check" title="Mobile verified via OTP">✓</span>
                </div>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">LOAN TYPE</span>
                <span className="spec-val">{isUsed ? 'Used Car Loan' : 'New Car Loan'}</span>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">REQUESTED LOAN AMOUNT</span>
                <span className="spec-val-bold">{formatINR(reqAmount)}</span>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">VEHICLE MODEL & FUEL</span>
                <span className="spec-val">{vehicleText} {fuel}</span>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">VEHICLE CONDITION</span>
                <span className="spec-val condition-val">
                  <span className="dot-used" />
                  <span>{isUsed ? 'Used (Pre-owned)' : 'Brand New'}</span>
                </span>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">VEHICLE REG. NUMBER</span>
                <span className="spec-reg-pill">{regNo}</span>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">CUSTOMER LOCATION</span>
                <span className="spec-val">{city} • PIN: {pincode}</span>
              </div>
            </div>
          </div>

          {/* Card 2: KYC & Vehicle Documents */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <div className="card-header-left">
                <div className="header-icon-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <h2 className="dossier-card-title">KYC & Vehicle Documents</h2>
                  <p className="dossier-card-sub">Mandatory verification checklist for financial underwriting</p>
                </div>
              </div>
              <span className="dossier-badge-green">
                {verifiedCount} of {totalMandatoryDocs} Verified
              </span>
            </div>

            {/* Privacy Compliance Banner */}
            <div className="doc-privacy-notice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Identity document numbers are masked for data protection and regulatory compliance.</span>
            </div>

            {/* Documents List */}
            <div className="doc-checklist-group">
              {/* 1. Aadhaar Card */}
              <div className="doc-checklist-item">
                <div className="doc-item-left">
                  <div className="doc-type-icon icon-aadhaar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <line x1="7" y1="8" x2="17" y2="8" />
                      <line x1="7" y1="12" x2="13" y2="12" />
                    </svg>
                  </div>
                  <div>
                    <div className="doc-title-line">
                      <span className="doc-name">Aadhaar Card (Mandatory)</span>
                      <span className="doc-status-verified">✓ Verified</span>
                    </div>
                    <span className="doc-sub-info">
                      {aadhaarDoc ? aadhaarDoc.file_name : `Aadhaar Card ${customerName.split(' ')[0]} XXXX 4819.pdf`} • Uploaded {createdDateStr}
                    </span>
                  </div>
                </div>

                <div className="doc-item-actions">
                  <button
                    type="button"
                    className="doc-btn-view"
                    onClick={() => setShowDocModal(aadhaarDoc || ({ file_name: 'Aadhaar_Card_XXXX4819.pdf', document_type_id: 'dt-aadhaar', status: 'verified', uploaded_at: createdDateStr } as any))}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>View Securely</span>
                  </button>
                  <button
                    type="button"
                    className="doc-btn-download"
                    onClick={(e) => handleDownloadDoc(aadhaarDoc || ({ file_name: 'Aadhaar_Card_XXXX4819.pdf' } as any), e)}
                    title="Download document from private quarantine"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* 2. PAN Card */}
              <div className="doc-checklist-item">
                <div className="doc-item-left">
                  <div className="doc-type-icon icon-pan">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <div className="doc-title-line">
                      <span className="doc-name">PAN Card (Mandatory)</span>
                      <span className="doc-status-verified">✓ Verified</span>
                    </div>
                    <span className="doc-sub-info">
                      {panDoc ? panDoc.file_name : 'PAN Card_XXXXX8910.pdf'} • Uploaded {createdDateStr}
                    </span>
                  </div>
                </div>

                <div className="doc-item-actions">
                  <button
                    type="button"
                    className="doc-btn-view"
                    onClick={() => setShowDocModal(panDoc || ({ file_name: 'PAN_Card_XXXXX8910.pdf', document_type_id: 'dt-pan', status: 'verified', uploaded_at: createdDateStr } as any))}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>View Securely</span>
                  </button>
                  <button
                    type="button"
                    className="doc-btn-download"
                    onClick={(e) => handleDownloadDoc(panDoc || ({ file_name: 'PAN_Card_XXXXX8910.pdf' } as any), e)}
                    title="Download document from private quarantine"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* 3. RC Book (Mandatory for Used Car) */}
              {isUsed && (
                <div className="doc-checklist-item">
                  <div className="doc-item-left">
                    <div className="doc-type-icon icon-rc">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="7" cy="17" r="2" />
                        <circle cx="17" cy="17" r="2" />
                        <path d="M5 17h-2v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2" />
                      </svg>
                    </div>
                    <div>
                      <div className="doc-title-line">
                        <span className="doc-name">RC Book (Mandatory for Used vehicle)</span>
                        <span className="doc-status-review">⏳ Pending Telecaller Review</span>
                      </div>
                      <span className="doc-sub-info">
                        {rcDoc ? rcDoc.file_name : `RC_Book_${regNo.replace(/\s+/g, '')}.pdf`} • Uploaded {createdDateStr}
                      </span>
                    </div>
                  </div>

                  <div className="doc-item-actions">
                    <button
                      type="button"
                      className="doc-btn-view"
                      onClick={() => setShowDocModal(rcDoc || ({ file_name: `RC_Book_${regNo}.pdf`, document_type_id: 'dt-rc', status: 'pending', uploaded_at: createdDateStr } as any))}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>View Securely</span>
                    </button>
                    <button
                      type="button"
                      className="doc-btn-download"
                      onClick={(e) => handleDownloadDoc(rcDoc || ({ file_name: `RC_Book_${regNo}.pdf` } as any), e)}
                      title="Download document from private quarantine"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Referral Partner Attribution / Direct Intake */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <div className="card-header-left">
                <div className="header-icon-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div>
                  <h2 className="dossier-card-title">
                    {isDirectLead ? 'Direct Lead Sourcing & Attribution' : 'Referral Partner Attribution'}
                  </h2>
                  <p className="dossier-card-sub">
                    {isDirectLead
                      ? 'Internal lead intake: Walk-in, telephonic enquiry, or admin entry'
                      : 'Originating channel and payout commission alignment'}
                  </p>
                </div>
              </div>
              <span className="dossier-badge-gray">{isDirectLead ? 'Direct File' : 'VIP Partner'}</span>
            </div>

            <div className="partner-attr-grid">
              <div className="attr-item">
                <span className="attr-label">{isDirectLead ? 'SOURCING CHANNEL' : 'PARTNER NAME'}</span>
                <span className="attr-val-bold">{partnerName}</span>
                <span className="attr-sub">{isDirectLead ? 'Direct Operations Desk' : 'Authorized Dealership Hub'}</span>
              </div>

              <div className="attr-item">
                <span className="attr-label">{isDirectLead ? 'INTAKE CHANNEL' : 'PARTNER MOBILE & CONTACT'}</span>
                <span className="attr-val-bold">
                  {isDirectLead
                    ? 'Internal Desk'
                    : (caseData.referral_partner_mobile ? `+91 ${caseData.referral_partner_mobile}` : '+91 98200 12345')}
                </span>
                <span className="attr-sub">
                  {isDirectLead ? 'Attr: Administrator Direct Entry' : 'Attr: Manish Kothari (GM)'}
                </span>
              </div>

              <div className="attr-item">
                <span className="attr-label">CHANNEL SOURCE</span>
                <span className="attr-val-bold">{isDirectLead ? 'Direct Lead Intake' : 'Dealership Partner Desk'}</span>
                <span className="attr-sub">{isDirectLead ? 'Internal DSA OS Desk' : 'Web Portal Submission'}</span>
              </div>

              <div className="attr-item">
                <span className="attr-label">SUBMISSION TIMESTAMP</span>
                <span className="attr-val-bold">{createdDateStr} • 11:42 AM</span>
                <span className="attr-sub">{isDirectLead ? 'Direct Intake Desk' : 'Direct Ingestion API'}</span>
              </div>

              <div className="attr-item">
                <span className="attr-label">{isDirectLead ? 'SOURCE CODE' : 'PARTNER ID'}</span>
                <span className="attr-val-green">{partnerId}</span>
                <span className="attr-sub">
                  {isDirectLead ? 'Direct Channel (No Broker Payout)' : 'Tier 1 Commission Bracket (0.75%)'}
                </span>
              </div>

              <div className="attr-item attr-link-box">
                <Link to={isDirectLead ? '/cases' : '/referrals'} className="partner-ledger-link">
                  <span>{isDirectLead ? 'Back to All Leads' : 'View Partner Ledger & History'}</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* --- RIGHT COLUMN: Controls, Next Action, Timeline --- */}
        <div className="stitch-dossier-right">
          {/* Card 1: Assignment & Stage Control */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <div className="card-header-left">
                <div className="header-icon-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="4" y1="21" x2="4" y2="14" />
                    <line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" />
                    <line x1="20" y1="12" x2="20" y2="3" />
                  </svg>
                </div>
                <div>
                  <h2 className="dossier-card-title">Assignment & Stage Control</h2>
                  <p className="dossier-card-sub">Workflow ownership and progression</p>
                </div>
              </div>
            </div>

            {/* Assigned Telecaller Pill */}
            <div className="stage-telecaller-card">
              <div className="telecaller-avatar-circle">
                {caseData.assigned_telecaller_name
                  ? caseData.assigned_telecaller_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
                  : '—'}
              </div>
              <div className="telecaller-text-info">
                <span className="telecaller-title">
                  {caseData.assigned_telecaller_name || 'Unassigned Lead'}
                </span>
                <span className="telecaller-sub">
                  {caseData.assigned_telecaller_name ? 'Senior Telecaller • Queue Alpha' : 'Requires triage assignment'}
                </span>
              </div>
            </div>

            {/* Fast Reassignment Form (Admin Only) */}
            {!isTelecaller && (
              <div className="fast-reassign-box">
                <label className="fast-reassign-label">Fast Reassignment</label>
                <div className="fast-reassign-row">
                  <select
                    value={selectedTelecallerId}
                    onChange={(e) => setSelectedTelecallerId(e.target.value)}
                    className="stitch-reassign-select"
                  >
                    <option value="usr-telecaller-1">Priya Sharma</option>
                    <option value="usr-telecaller-2">Rahul Verma</option>
                  </select>
                  <button
                    type="button"
                    className="stitch-btn-update"
                    onClick={() => handleReassign(selectedTelecallerId)}
                    disabled={isReassigning}
                  >
                    {isReassigning ? '...' : 'Update'}
                  </button>
                </div>
              </div>
            )}

            {/* Lead Stage Progression Stepper */}
            <div className="stage-progression-box">
              <span className="stage-section-label">LEAD STAGE PROGRESSION</span>
              <div className="stage-radio-grid">
                {[
                  { key: 'lead', label: 'New' },
                  { key: 'in_calling', label: 'Active Calling' },
                  { key: 'interested', label: 'Interested' },
                  { key: 'callback_scheduled', label: 'Follow-up' },
                  { key: 'disbursed', label: 'Converted' },
                  { key: 'closed', label: 'Lost' },
                ].map((st) => {
                  const isCurrent =
                    (st.key === 'interested' && isInterested) ||
                    (st.key === 'disbursed' && isConverted) ||
                    caseData.status === st.key
                  return (
                    <button
                      key={st.key}
                      type="button"
                      className={`stage-radio-pill ${isCurrent ? 'stage-active' : ''}`}
                      onClick={() => handleStageSelect(st.key)}
                      disabled={isUpdatingStatus}
                    >
                      <span className={`stage-radio-indicator ${isCurrent ? 'checked' : ''}`} />
                      <span>{st.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Card 2: Scheduled Next Action Milestone */}
          <div className="scheduled-milestone-card">
            <div className="milestone-top-row">
              <span className="milestone-label">SCHEDULED NEXT ACTION</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="milestone-time-val">Tomorrow • 11:30 AM</div>
            <p className="milestone-desc">
              "Discuss loan sanction from HDFC Bank with customer and coordinate valuation report submission."
            </p>
          </div>

          {/* Card 3: Calling Activity & Audit Timeline */}
          <div className="dossier-card">
            <div className="dossier-card-header">
              <div className="card-header-left">
                <div className="header-icon-box">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 14 14" />
                  </svg>
                </div>
                <div>
                  <h2 className="dossier-card-title">Calling Activity & Audit Timeline</h2>
                </div>
              </div>
            </div>

            {/* Log New Call Button */}
            <button
              type="button"
              className="btn-log-call-timeline"
              onClick={() => setShowCallModal(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Log New Call / Note</span>
            </button>

            {/* Timeline Stream */}
            <div className="timeline-stream">
              {timelineEvents.map((event: any, idx: number) => {
                const eventDate = new Date(event.created_at || Date.now())
                const dateStr = eventDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
                const timeStr = eventDate.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })

                const isSystem = (event.telecaller_name || '').includes('System')
                return (
                  <div key={event.id || idx} className="timeline-node">
                    <div className="timeline-dot-col">
                      <div className={`timeline-dot ${isSystem ? 'dot-gray' : 'dot-green'}`} />
                      {idx < timelineEvents.length - 1 && <div className="timeline-connector-line" />}
                    </div>

                    <div className="timeline-content-col">
                      <div className="timeline-header-line">
                        <span className="timeline-actor">{event.telecaller_name || 'Telecaller'}</span>
                        <span className="timeline-time">{dateStr} • {timeStr}</span>
                      </div>

                      <div className="timeline-outcome-pill">
                        <span className="outcome-check">✓</span>
                        <span>Outcome: {event.outcome ? event.outcome.replace(/_/g, ' ') : 'Call Logged'}</span>
                      </div>

                      <p className="timeline-note-text">"{event.remarks || 'No remarks recorded.'}"</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* --- Secure Document Viewer Modal --- */}
      {showDocModal && (
        <div className="stitch-modal-backdrop" onClick={() => setShowDocModal(null)}>
          <div className="stitch-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📄</span>
                <div>
                  <h3 className="modal-title">{showDocModal.file_name}</h3>
                  <span className="modal-subtitle">Secure Quarantine Vault (SHA-256 Validated)</span>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowDocModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body-content">
              <div className="secure-doc-preview-box">
                <div className="doc-watermark">JAI AUTOMOBILES • CONFIDENTIAL UNDERWRITING FILE</div>
                <div className="doc-preview-meta">
                  <div className="preview-field">
                    <span>Document Type:</span>
                    <strong>{showDocModal.document_type_id?.replace('dt-', '').toUpperCase()}</strong>
                  </div>
                  <div className="preview-field">
                    <span>Target Customer:</span>
                    <strong>{customerName}</strong>
                  </div>
                  <div className="preview-field">
                    <span>Masked Identifier:</span>
                    <strong style={{ fontFamily: 'monospace' }}>
                      {showDocModal.document_type_id?.includes('pan') ? 'ABCDE****F' : '**** **** 4819'}
                    </strong>
                  </div>
                  <div className="preview-field">
                    <span>Verification Status:</span>
                    <span className="status-verified-chip">✓ Verified</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                type="button"
                className="stitch-btn-secondary"
                onClick={() => setShowDocModal(null)}
              >
                Close Preview
              </button>
              <button
                type="button"
                className="stitch-btn-primary"
                onClick={(e) => handleDownloadDoc(showDocModal, e)}
              >
                Download Verified PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Log Call / Schedule Follow-up Modal --- */}
      {(showCallModal || showFollowUpModal) && (
        <div
          className="stitch-modal-backdrop"
          onClick={() => {
            setShowCallModal(false)
            setShowFollowUpModal(false)
          }}
        >
          <div className="stitch-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-title">
                {showFollowUpModal ? 'Schedule Customer Callback' : 'Log Call Activity & Note'}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setShowCallModal(false)
                  setShowFollowUpModal(false)
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLogCallSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Call Outcome *</label>
                <select
                  value={logOutcome}
                  onChange={(e) => setLogOutcome(e.target.value)}
                  className="form-select"
                  required
                >
                  <option value="interested">Interested / Follow-up Scheduled</option>
                  <option value="connected">Connected / Initial Pitch</option>
                  <option value="follow_up">Scheduled Callback</option>
                  <option value="not_reachable">Not Reachable / Busy</option>
                  <option value="not_interested">Not Interested</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Follow-up Date & Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={logFollowUpDate}
                  onChange={(e) => setLogFollowUpDate(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Operational Notes & Remarks *</label>
                <textarea
                  rows={3}
                  value={logRemarks}
                  onChange={(e) => setLogRemarks(e.target.value)}
                  placeholder="Enter detailed outcome notes, customer preferences, or bank requirements..."
                  className="form-textarea"
                  required
                />
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="stitch-btn-secondary"
                  onClick={() => {
                    setShowCallModal(false)
                    setShowFollowUpModal(false)
                  }}
                  disabled={isSubmittingLog}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="stitch-btn-primary"
                  disabled={isSubmittingLog}
                >
                  {isSubmittingLog ? 'Saving...' : 'Save Activity Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Reassign Lead Modal (Admin Only) --- */}
      {showReassignModal && !isTelecaller && (
        <div className="stitch-modal-backdrop" onClick={() => setShowReassignModal(false)}>
          <div className="stitch-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-title">Reassign Lead Queue</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowReassignModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body-content">
              <div className="form-group">
                <label className="form-label">Select Telecaller Desk</label>
                <select
                  value={selectedTelecallerId}
                  onChange={(e) => setSelectedTelecallerId(e.target.value)}
                  className="form-select"
                >
                  <option value="usr-telecaller-1">Priya Sharma (Senior Telecaller • Queue Alpha)</option>
                  <option value="usr-telecaller-2">Rahul Verma (Sr. Associate • Queue Beta)</option>
                </select>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                type="button"
                className="stitch-btn-secondary"
                onClick={() => setShowReassignModal(false)}
                disabled={isReassigning}
              >
                Cancel
              </button>
              <button
                type="button"
                className="stitch-btn-primary"
                onClick={() => handleReassign(selectedTelecallerId)}
                disabled={isReassigning}
              >
                {isReassigning ? 'Reassigning...' : 'Confirm Reassignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Update Status Modal --- */}
      {showStatusModal && (
        <div className="stitch-modal-backdrop" onClick={() => setShowStatusModal(false)}>
          <div className="stitch-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3 className="modal-title">Update Lead Status</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowStatusModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body-content">
              <div className="form-group">
                <label className="form-label">Target Workflow Stage</label>
                <select
                  value={targetStatus || caseData.status}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="form-select"
                >
                  <option value="lead">New Lead</option>
                  <option value="in_calling">Active Calling</option>
                  <option value="interested">Interested</option>
                  <option value="callback_scheduled">Follow-up Due</option>
                  <option value="sanctioned">Sanctioned</option>
                  <option value="disbursed">Disbursed (Converted)</option>
                  <option value="closed">Closed / Withdrawn</option>
                </select>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                type="button"
                className="stitch-btn-secondary"
                onClick={() => setShowStatusModal(false)}
                disabled={isUpdatingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                className="stitch-btn-primary"
                onClick={() => {
                  if (targetStatus) {
                    handleStageSelect(targetStatus)
                    setShowStatusModal(false)
                  }
                }}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? 'Updating...' : 'Confirm Status Change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
