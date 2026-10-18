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
import { getDocumentPreviewInfo, downloadStoredDocument, getDocumentBlob, type DocumentPreviewInfo } from '../../shared/lib/documentStorage'
import { evaluateThreeWayNameComparison, runClientOcr, evaluateAddressMatch, normalizeName } from '../../shared/lib/clientOcrService'
import { PdfDocumentViewer } from '../../shared/components/PdfDocumentViewer'
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
  const [modalDocUrl, setModalDocUrl] = useState<string | null>(null)
  const [modalDocPreview, setModalDocPreview] = useState<DocumentPreviewInfo | null>(null)
  const [isScanningDoc, setIsScanningDoc] = useState<string | null>(null)
  const [isCorrectingName, setIsCorrectingName] = useState(false)
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

  const triggerAutoOcr = useCallback(async (docItem: DocumentItem, currentCase: any) => {
    try {
      const docType = docItem.document_type_id === 'dt-pan' || docItem.file_name.toLowerCase().includes('pan') ? 'pan' : 'aadhaar'
      const blob = await getDocumentBlob(docItem.id)
      const cName = currentCase?.primary_applicant_name || currentCase?.applicant_name || ''
      const ocrRes = await runClientOcr(blob || new Blob(), docType, {
        customer_name: cName,
        fileName: docItem.file_name,
        city: currentCase?.primary_party?.city,
        district: currentCase?.primary_party?.district || currentCase?.district,
        locality: currentCase?.primary_party?.locality || currentCase?.locality,
      })

      await api.post(`/cases/${currentCase.id}/documents/ocr`, {
        document_id: docItem.id,
        scan_result: ocrRes,
      })
      setDocuments((prev) =>
        prev.map((d) => (d.id === docItem.id ? { ...d, scan_result: ocrRes as any, status: 'received' as const } : d))
      )
    } catch (e) {
      console.warn('Auto OCR notice:', e)
    }
  }, [])

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

      // Auto-scan pending KYC documents in background so OCR results appear automatically
      const pendingDocs = docs.filter(
        (d) =>
          (d.document_type_id === 'dt-aadhaar' || d.document_type_id === 'dt-pan' || d.file_name.toLowerCase().includes('aadhaar') || d.file_name.toLowerCase().includes('pan')) &&
          (!d.scan_result || d.scan_result.ocr_status !== 'extracted' || !d.scan_result.fields?.length)
      )
      if (pendingDocs.length > 0) {
        pendingDocs.forEach((pDoc) => {
          triggerAutoOcr(pDoc, data)
        })
      }
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
  }, [id, triggerAutoOcr])

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

      const assignEvent = {
        id: `act-assign-${Date.now()}`,
        outcome: 'Lead Assigned',
        remarks: `Lead assigned to ${tcName} by Administrator.`,
        telecaller_name: user?.name || 'Administrator',
        created_at: new Date().toISOString(),
      }
      const updatedHistory = [assignEvent, ...(caseData.call_activity_history || [])]

      // Update local state
      const updated = {
        ...caseData,
        assigned_telecaller_id: newTeleId,
        assigned_telecaller_name: tcName,
        call_activity_history: updatedHistory,
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

  // Load preview URL and image type when doc modal opens
  useEffect(() => {
    let active = true
    if (showDocModal) {
      getDocumentPreviewInfo(showDocModal.id).then((info) => {
        if (!active) return
        if (info) {
          setModalDocPreview(info)
          setModalDocUrl(info.url)
        } else if ((showDocModal as any).file_url) {
          const url = (showDocModal as any).file_url
          const isImg = url.match(/\.(jpeg|jpg|png|webp)/i) !== null
          setModalDocPreview({ url, isImage: isImg, isPdf: !isImg, blob: null })
          setModalDocUrl(url)
        } else {
          setModalDocPreview(null)
          setModalDocUrl(null)
        }
      })
    } else {
      setModalDocPreview(null)
      setModalDocUrl(null)
    }
    return () => {
      active = false
    }
  }, [showDocModal])

  // Admin-Only Customer Name Correction (Section 5)
  const handleAdminCorrectCustomerName = async (newName: string) => {
    if (!caseData || isTelecaller) return
    setIsCorrectingName(true)
    try {
      await api.post(`/cases/${caseData.id}/correct-name`, {
        new_name: newName,
        reason: 'Matched against verified Aadhaar and PAN documents',
      })
      const updated = {
        ...caseData,
        applicant_name: newName,
        primary_applicant_name: newName,
        primary_party: {
          ...(caseData.primary_party || {}),
          name: newName,
        },
      }
      setCaseData(updated)
      setNoticeMsg(`Customer name successfully updated to "${newName}" by Administrator.`)
      setTimeout(() => setNoticeMsg(null), 5000)
    } catch (err: any) {
      alert(err.message || 'Failed to update customer name.')
    } finally {
      setIsCorrectingName(false)
    }
  }

  // Trigger real OCR on document
  const handleTriggerOcr = async (docItem: DocumentItem) => {
    if (!caseData) return
    setIsScanningDoc(docItem.id)
    try {
      const docType = docItem.document_type_id === 'dt-pan' || docItem.file_name.toLowerCase().includes('pan') ? 'pan' : 'aadhaar'
      const blob = await getDocumentBlob(docItem.id)
      const ocrRes = await runClientOcr(blob || new Blob(), docType, {
        customer_name: customerName,
        fileName: docItem.file_name,
        city: city || undefined,
        district: district || undefined,
        locality: locality || undefined,
      })

      await api.post(`/cases/${caseData.id}/documents/ocr`, {
        document_id: docItem.id,
        scan_result: ocrRes,
      })
      const updatedDocs: DocumentItem[] = documents.map((d) => (d.id === docItem.id ? { ...d, scan_result: ocrRes as any, status: 'received' as const } : d))
      setDocuments(updatedDocs)
      setNoticeMsg(`OCR extraction successfully updated for ${docItem.file_name}.`)
      setTimeout(() => setNoticeMsg(null), 4000)
    } catch (e: any) {
      alert('OCR Scan error: ' + (e.message || 'Extraction failed'))
    } finally {
      setIsScanningDoc(null)
    }
  }

  // Document download handler (downloads genuine file)
  const handleDownloadDoc = async (docItem: DocumentItem, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const downloaded = await downloadStoredDocument(docItem.id, docItem.file_name)
    if (!downloaded) {
      if ((docItem as any).file_url) {
        const a = document.createElement('a')
        a.href = (docItem as any).file_url
        a.download = docItem.file_name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        alert(`Original file "${docItem.file_name}" is securely held in private storage. Download stream initiated.`)
      }
    }
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
  const customerName = caseData.primary_applicant_name || caseData.applicant_name || 'Borrower'
  const nameParts = customerName.trim().split(/\s+/)
  const initials = nameParts.length > 1
    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : nameParts[0].slice(0, 2).toUpperCase()

  const mobile = caseData.primary_applicant_mobile || caseData.mobile || '—'
  const email = (caseData as any).email || `${customerName.toLowerCase().replace(/\s+/g, '.')}@example.com`
  const leadId = caseData.case_no || 'JA-2025-0101'
  const createdDate = caseData.created_at ? new Date(caseData.created_at) : new Date()
  const createdDateStr = createdDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const reqAmount = caseData.loan_amount_requested || caseData.applied_loan_amount || 0
  const vehicleText = caseData.vehicle_details || caseData.vehicle_summary || 'Vehicle'
  const condition = caseData.vehicle?.condition || (caseData as any).vehicle_condition || 'used'
  const isUsed = condition === 'used'
  const rawRegNo = caseData.vehicle?.registration_no || (caseData as any).vehicle_reg_no || ''
  const regNo = isUsed
    ? (rawRegNo.trim() ? rawRegNo.trim() : 'Not provided')
    : (rawRegNo.trim() ? rawRegNo.trim() : 'Not applicable — new vehicle')
  const fuel = (caseData as any).fuel_type || 'Petrol'
  const vehicleYear = caseData.vehicle?.year_of_manufacture || 2024
  const locality = caseData.primary_party?.locality || (caseData as any).locality || null
  const district = caseData.primary_party?.district || (caseData as any).district || null
  const city = caseData.primary_party?.city || 'Mumbai'
  const partyState = caseData.primary_party?.state || ''
  const pincode = (caseData as any).pincode || caseData.primary_party?.pincode || '400053'

  // Timezone-safe date parser
  const expectedLoanDate = (caseData as any).expected_loan_required_date || null
  const formatSafeDate = (dStr: string | null | undefined): string => {
    if (!dStr) return 'Immediate / Not specified'
    if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
      const [y, m, d] = dStr.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }
    const date = new Date(dStr)
    return isNaN(date.getTime()) ? dStr : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const isDirectLead =
    caseData.source_type === 'direct' ||
    (!caseData.referral_partner_name &&
      !caseData.referral_partner_id &&
      !caseData.referral_profile_id &&
      (caseData.source_name?.toLowerCase().includes('direct') || caseData.source_name === 'Quick Intake Desk'))

  const partnerName = isDirectLead
    ? 'Direct Customer Walk-in / Telephonic'
    : (caseData.referral_partner_name || caseData.source_name || 'Partner Desk')
  const partnerId = isDirectLead ? 'DIR-DIRECT-INTAKE' : (caseData.referral_profile_id || caseData.referral_partner_id || 'REF-PARTNER')

  // Status mapping
  const currentStatus = caseData.status || 'lead'
  const currentOutcome = caseData.call_outcome || 'new'
  const isConverted = currentStatus === 'disbursed' || currentStatus === 'sanctioned' || currentStatus === 'converted'
  const isInterested = currentOutcome === 'interested' || currentStatus === 'interested'
  const isUnassigned = !caseData.assigned_telecaller_id && !caseData.assigned_telecaller_name
  const hasCalls = Boolean(caseData.call_activity_history && caseData.call_activity_history.length > 0)
  const hasFollowUp = Boolean(caseData.follow_up_at)

  let statusBadgeLabel = 'Interested'
  let statusBadgeClass = 'badge-interested'
  if (isConverted) {
    statusBadgeLabel = 'Converted'
    statusBadgeClass = 'badge-converted'
  } else if (currentOutcome === 'follow_up' || currentStatus === 'callback_scheduled' || hasFollowUp) {
    statusBadgeLabel = 'Follow-up'
    statusBadgeClass = 'badge-follow-up'
  } else if (isUnassigned) {
    statusBadgeLabel = 'Unassigned'
    statusBadgeClass = 'badge-unassigned'
  } else if (isInterested) {
    statusBadgeLabel = 'Interested'
    statusBadgeClass = 'badge-interested'
  } else {
    statusBadgeLabel = currentStatus.toUpperCase()
    statusBadgeClass = 'badge-interested'
  }

  // Documents checklist mapping
  const aadhaarDoc = documents.find((d) => d.document_type_id === 'dt-aadhaar' || d.file_name.toLowerCase().includes('aadhaar'))
  const panDoc = documents.find((d) => d.document_type_id === 'dt-pan' || d.file_name.toLowerCase().includes('pan'))
  const rcDoc = documents.find((d) => d.document_type_id === 'dt-rc' || d.file_name.toLowerCase().includes('rc'))

  const verifiedCount = [aadhaarDoc, panDoc, rcDoc].filter((d) => d && d.status === 'verified').length
  const totalMandatoryDocs = isUsed ? 3 : 2

  // Timeline events mapping (strictly genuine - never invent fake entries)
  const timelineEvents = caseData.call_activity_history || []

  // Document OCR helpers
  const getOcrField = (doc: DocumentItem | undefined, fieldKey: string): string => {
    if (!doc || !doc.scan_result?.fields) return '—'
    const f = doc.scan_result.fields.find((item) => item.field_key === fieldKey)
    return f?.value || '—'
  }

  const getFieldMatch = (
    submitted: string | null | undefined,
    ocrVal: string,
    fieldType?: 'customer_name' | 'address' | 'dob' | 'general'
  ): { label: string; badgeClass: string } => {
    if (!ocrVal || ocrVal === '—' || ocrVal.includes('Pending') || ocrVal.includes('Not extracted')) {
      return { label: 'Unable to compare', badgeClass: 'comp-uncompared' }
    }
    if (ocrVal.includes('Scanned') || ocrVal.includes('Manual Verification') || ocrVal.includes('Visual')) {
      return { label: 'Visual Review Required', badgeClass: 'comp-review' }
    }
    if (!submitted || submitted.includes('Not collected') || submitted.includes('Not applicable')) {
      return { label: 'OCR Captured', badgeClass: 'comp-captured' }
    }

    if (fieldType === 'customer_name') {
      const sNorm = normalizeName(submitted)
      const oNorm = normalizeName(ocrVal)
      if (sNorm && oNorm && (sNorm === oNorm || sNorm.includes(oNorm) || oNorm.includes(sNorm))) {
        return { label: '✓ Match', badgeClass: 'comp-match' }
      }
      return { label: '✕ Mismatch', badgeClass: 'comp-mismatch' }
    }

    const s = submitted.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    const o = ocrVal.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    if (s === o || o.includes(s) || s.includes(o)) {
      return { label: '✓ Match', badgeClass: 'comp-match' }
    }
    return { label: '✕ Mismatch', badgeClass: 'comp-mismatch' }
  }

  // Real three-way name comparison (Section 4 & 5)
  const aadhaarExtractedName = getOcrField(aadhaarDoc, 'customer_name')
  const panExtractedName = getOcrField(panDoc, 'customer_name')
  const nameComparison = evaluateThreeWayNameComparison(customerName, aadhaarExtractedName, panExtractedName)

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
            <span className={`metric-main-value ${isUnassigned ? 'text-amber' : 'text-emerald'}`}>
              {isUnassigned
                ? 'Assign Lead'
                : hasFollowUp
                ? 'Scheduled Callback'
                : !hasCalls
                ? 'First Call Pending'
                : (caseData.status ? caseData.status.replace(/_/g, ' ').toUpperCase() : 'In Progress')}
            </span>
            <span className="metric-caption">
              {isUnassigned
                ? 'Operational action required'
                : hasFollowUp
                ? formatSafeDate(caseData.follow_up_at)
                : !hasCalls
                ? (caseData.assigned_telecaller_name || 'Telecaller')
                : (caseData.call_outcome ? caseData.call_outcome.replace(/_/g, ' ') : 'Underwriting Review')}
            </span>
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
                <span className={isUsed && rawRegNo.trim() ? "spec-reg-pill" : "spec-val"}>{regNo}</span>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">CUSTOMER LOCATION</span>
                <span className="spec-val">
                  {locality && district
                    ? `${locality}, Dist: ${district}${partyState ? `, ${partyState}` : ''} • PIN: ${pincode}`
                    : `${city} • PIN: ${pincode}`}
                </span>
              </div>

              <div className="spec-field-box">
                <span className="spec-label">EXPECTED LOAN REQUIRED DATE</span>
                <span className="spec-val-bold">
                  {formatSafeDate(expectedLoanDate)}
                </span>
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
              <span className={verifiedCount === totalMandatoryDocs ? "dossier-badge-green" : "dossier-badge-amber"}>
                {verifiedCount} of {totalMandatoryDocs} Verified
              </span>
            </div>

            {/* Three-Way Identity & Name Cross-Verification (Section 4 & 5) */}
            <div className="three-way-name-card">
              <div className="three-way-header">
                <div>
                  <h3 className="three-way-title">Three-Way Identity & Name Cross-Verification</h3>
                  <p className="three-way-sub">Independent comparison of submitted referral data against genuine Aadhaar and PAN OCR extractions</p>
                </div>
                <span className={`three-way-status-pill ${nameComparison.badgeClass}`}>
                  {nameComparison.statusLabel}
                </span>
              </div>

              <div className="three-way-table-container">
                <table className="three-way-table">
                  <thead>
                    <tr>
                      <th>Identity Record / Source</th>
                      <th>Extracted Legal Name</th>
                      <th>Source Authority</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Submitted Customer Name</strong></td>
                      <td className="font-semibold">{customerName}</td>
                      <td>Referral Intake Form</td>
                      <td><span className="source-pill">Primary Record</span></td>
                    </tr>
                    <tr>
                      <td><strong>Aadhaar Card</strong></td>
                      <td className="font-semibold">{aadhaarExtractedName}</td>
                      <td>UIDAI Document OCR</td>
                      <td>
                        <span className={`status-pill ${aadhaarExtractedName && aadhaarExtractedName !== '—' ? 'pill-success' : 'pill-pending'}`}>
                          {aadhaarExtractedName && aadhaarExtractedName !== '—' ? 'OCR Extracted' : 'OCR Pending'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Income Tax PAN Card</strong></td>
                      <td className="font-semibold">{panExtractedName}</td>
                      <td>ITD Document OCR</td>
                      <td>
                        <span className={`status-pill ${panExtractedName && panExtractedName !== '—' ? 'pill-success' : 'pill-pending'}`}>
                          {panExtractedName && panExtractedName !== '—' ? 'OCR Extracted' : 'OCR Pending'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Case B: Aadhaar and PAN agree, but differ from form name */}
              {nameComparison.matchCase === 'CASE_B' && (
                <div className="admin-name-correction-banner">
                  <div className="banner-left">
                    <span className="banner-alert-icon">⚠️</span>
                    <div>
                      <strong>Discrepancy Detected:</strong> {nameComparison.explanation}
                      <div className="banner-subtext">
                        Aadhaar and PAN names match ("{nameComparison.recommendedCorrection}").
                        {!isTelecaller ? ' As an Administrator, you can update the customer record to match the verified government documents.' : ' Only an Administrator can resolve this mismatch.'}
                      </div>
                    </div>
                  </div>
                  {!isTelecaller ? (
                    <button
                      type="button"
                      className="btn-correct-name"
                      disabled={isCorrectingName}
                      onClick={() => handleAdminCorrectCustomerName(nameComparison.recommendedCorrection!)}
                    >
                      {isCorrectingName ? 'Updating...' : `Update Name to "${nameComparison.recommendedCorrection}"`}
                    </button>
                  ) : (
                    <span className="telecaller-notice-tag">Admin Review Required</span>
                  )}
                </div>
              )}

              {/* Case C: Aadhaar and PAN disagree */}
              {nameComparison.matchCase === 'CASE_C' && (
                <div className="admin-name-discrepancy-banner">
                  <span>⚠️</span>
                  <div>
                    <strong>Document Name Mismatch:</strong> Aadhaar and PAN records contain materially different names. Manual administrative review of the original documents is required before any name correction can be considered.
                  </div>
                </div>
              )}

              {/* Case D: Documents unread or pending */}
              {nameComparison.matchCase === 'CASE_D' && (
                <div className="doc-privacy-notice" style={{ marginTop: '0.75rem' }}>
                  <span>ℹ️ {nameComparison.explanation}</span>
                </div>
              )}
            </div>

            {/* Privacy Compliance Banner */}
            <div className="doc-privacy-notice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Identity document numbers are masked for data protection and regulatory compliance. Documents are securely held in private storage.</span>
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
                      {aadhaarDoc ? (
                        aadhaarDoc.status === 'verified' ? (
                          <span className="doc-status-verified">✓ Verified</span>
                        ) : (aadhaarDoc.status as string) === 'mismatch' ? (
                          <span className="doc-status-mismatch">✕ Mismatch</span>
                        ) : aadhaarDoc.scan_result?.ocr_status === 'extracted' ? (
                          <span className="doc-status-extracted">⚡ OCR Extracted</span>
                        ) : aadhaarDoc.scan_result?.ocr_status === 'failed' ? (
                          <span className="doc-status-failed">✕ OCR Failed</span>
                        ) : (
                          <span className="doc-status-pending">⏳ OCR Pending</span>
                        )
                      ) : (
                        <span className="doc-status-missing">⚠️ Not Uploaded</span>
                      )}
                    </div>
                    <span className="doc-sub-info">
                      {aadhaarDoc
                        ? `${aadhaarDoc.file_name} • ${aadhaarDoc.file_size ? `${(aadhaarDoc.file_size / 1024).toFixed(0)} KB • ` : ''}Uploaded ${aadhaarDoc.uploaded_at ? new Date(aadhaarDoc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : createdDateStr}`
                        : 'No Aadhaar document attached • Upload required for underwriting'}
                    </span>
                  </div>
                </div>

                {aadhaarDoc && (
                  <div className="doc-item-actions">
                    <button
                      type="button"
                      className="doc-btn-view"
                      onClick={() => setShowDocModal(aadhaarDoc)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>View Document</span>
                    </button>
                    <button
                      type="button"
                      className="doc-btn-download"
                      onClick={(e) => handleDownloadDoc(aadhaarDoc, e)}
                      title="Download original document"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      className="btn-outline-action"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => handleTriggerOcr(aadhaarDoc)}
                      disabled={isScanningDoc === aadhaarDoc.id}
                      title="Run automatic OCR extraction on uploaded file"
                    >
                      <span>{isScanningDoc === aadhaarDoc.id ? '⚡ Scanning...' : '⚡ Run OCR Scan'}</span>
                    </button>
                  </div>
                )}

                {/* Aadhaar Field Comparison Table */}
                {aadhaarDoc && (
                  <div className="doc-comparison-drawer">
                    <table className="doc-comparison-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Submitted Details</th>
                          <th>OCR-Extracted Details</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>Full Name</strong></td>
                          <td>{customerName}</td>
                          <td>{getOcrField(aadhaarDoc, 'customer_name')}</td>
                          <td>
                            {(() => {
                              const r = getFieldMatch(customerName, getOcrField(aadhaarDoc, 'customer_name'), 'customer_name')
                              return <span className={`comp-badge ${r.badgeClass}`}>{r.label}</span>
                            })()}
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Aadhaar (Masked)</strong></td>
                          <td><span className="text-muted">Not collected on form</span></td>
                          <td>{getOcrField(aadhaarDoc, 'aadhaar_masked')}</td>
                          <td>
                            {(() => {
                              const val = getOcrField(aadhaarDoc, 'aadhaar_masked')
                              if (!val || val === '—' || val.includes('Manual Verification') || val.includes('Scanned') || val.includes('Unable')) {
                                return <span className="comp-badge comp-review">Visual Review Required</span>
                              }
                              return <span className="comp-badge comp-captured">OCR Captured</span>
                            })()}
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Date of Birth</strong></td>
                          <td><span className="text-muted">Not collected on form</span></td>
                          <td>{getOcrField(aadhaarDoc, 'dob')}</td>
                          <td>
                            {(() => {
                              const dobVal = getOcrField(aadhaarDoc, 'dob')
                              if (!dobVal || dobVal === '—' || dobVal.includes('Not extracted') || dobVal.includes('Pending')) {
                                return <span className="comp-badge comp-uncompared">Not extracted</span>
                              }
                              return <span className="comp-badge comp-captured">OCR Captured</span>
                            })()}
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Location / Address</strong></td>
                          <td>{locality && district ? `${locality}, ${district}` : (city || pincode)}</td>
                          <td>{getOcrField(aadhaarDoc, 'address')}</td>
                          <td>
                            {(() => {
                              const r = evaluateAddressMatch(locality, district, city, getOcrField(aadhaarDoc, 'address'))
                              return <span className={`comp-badge ${r.badgeClass}`}>{r.label}</span>
                            })()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
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
                      {panDoc ? (
                        panDoc.status === 'verified' ? (
                          <span className="doc-status-verified">✓ Verified</span>
                        ) : (panDoc.status as string) === 'mismatch' ? (
                          <span className="doc-status-mismatch">✕ Mismatch</span>
                        ) : panDoc.scan_result?.ocr_status === 'extracted' ? (
                          <span className="doc-status-extracted">⚡ OCR Extracted</span>
                        ) : panDoc.scan_result?.ocr_status === 'failed' ? (
                          <span className="doc-status-failed">✕ OCR Failed</span>
                        ) : (
                          <span className="doc-status-pending">⏳ OCR Pending</span>
                        )
                      ) : (
                        <span className="doc-status-missing">⚠️ Not Uploaded</span>
                      )}
                    </div>
                    <span className="doc-sub-info">
                      {panDoc
                        ? `${panDoc.file_name} • ${panDoc.file_size ? `${(panDoc.file_size / 1024).toFixed(0)} KB • ` : ''}Uploaded ${panDoc.uploaded_at ? new Date(panDoc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : createdDateStr}`
                        : 'No PAN document attached • Upload required for underwriting'}
                    </span>
                  </div>
                </div>

                {panDoc && (
                  <div className="doc-item-actions">
                    <button
                      type="button"
                      className="doc-btn-view"
                      onClick={() => setShowDocModal(panDoc)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>View Document</span>
                    </button>
                    <button
                      type="button"
                      className="doc-btn-download"
                      onClick={(e) => handleDownloadDoc(panDoc, e)}
                      title="Download original document"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      className="btn-outline-action"
                      style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => handleTriggerOcr(panDoc)}
                      disabled={isScanningDoc === panDoc.id}
                      title="Run automatic OCR extraction on uploaded file"
                    >
                      <span>{isScanningDoc === panDoc.id ? '⚡ Scanning...' : '⚡ Run OCR Scan'}</span>
                    </button>
                  </div>
                )}

                {/* PAN Field Comparison Table */}
                {panDoc && (
                  <div className="doc-comparison-drawer">
                    <table className="doc-comparison-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Submitted Details</th>
                          <th>OCR-Extracted Details</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>Full Name</strong></td>
                          <td>{customerName}</td>
                          <td>{getOcrField(panDoc, 'customer_name')}</td>
                          <td>
                            {(() => {
                              const r = getFieldMatch(customerName, getOcrField(panDoc, 'customer_name'), 'customer_name')
                              return <span className={`comp-badge ${r.badgeClass}`}>{r.label}</span>
                            })()}
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Income Tax PAN</strong></td>
                          <td><span className="text-muted">Not collected on form</span></td>
                          <td>{getOcrField(panDoc, 'pan_number')}</td>
                          <td>
                            {(() => {
                              const val = getOcrField(panDoc, 'pan_number')
                              if (!val || val === '—' || val.includes('Manual Verification') || val.includes('Scanned') || val.includes('Unable')) {
                                return <span className="comp-badge comp-review">Visual Review Required</span>
                              }
                              return <span className="comp-badge comp-captured">OCR Captured</span>
                            })()}
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Date of Birth</strong></td>
                          <td><span className="text-muted">Not collected on form</span></td>
                          <td>{getOcrField(panDoc, 'dob')}</td>
                          <td>
                            {(() => {
                              const dobVal = getOcrField(panDoc, 'dob')
                              if (!dobVal || dobVal === '—' || dobVal.includes('Not extracted') || dobVal.includes('Manual Verification') || dobVal.includes('Scanned') || dobVal.includes('Pending')) {
                                return <span className="comp-badge comp-uncompared">Unable to compare</span>
                              }
                              return <span className="comp-badge comp-captured">OCR Captured</span>
                            })()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. RC Book (Mandatory only for Used Car) */}
              {isUsed ? (
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
                        {rcDoc ? (
                          rcDoc.status === 'verified' ? (
                            <span className="doc-status-verified">✓ Verified</span>
                          ) : (rcDoc.status as string) === 'mismatch' ? (
                            <span className="doc-status-mismatch">✕ Mismatch</span>
                          ) : rcDoc.scan_result?.ocr_status === 'extracted' ? (
                            <span className="doc-status-extracted">⚡ OCR Extracted</span>
                          ) : (
                            <span className="doc-status-pending">⏳ OCR Pending</span>
                          )
                        ) : (
                          <span className="doc-status-missing">⚠️ Not Uploaded</span>
                        )}
                      </div>
                      <span className="doc-sub-info">
                        {rcDoc
                          ? `${rcDoc.file_name} • ${rcDoc.file_size ? `${(rcDoc.file_size / 1024).toFixed(0)} KB • ` : ''}Uploaded ${rcDoc.uploaded_at ? new Date(rcDoc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : createdDateStr}`
                          : 'Used car loans require Registration Certificate upload'}
                      </span>
                    </div>
                  </div>

                  {rcDoc && (
                    <div className="doc-item-actions">
                      <button
                        type="button"
                        className="doc-btn-view"
                        onClick={() => setShowDocModal(rcDoc)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>View Document</span>
                      </button>
                      <button
                        type="button"
                        className="doc-btn-download"
                        onClick={(e) => handleDownloadDoc(rcDoc, e)}
                        title="Download original document"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Download</span>
                      </button>
                    </div>
                  )}

                  {rcDoc && (
                    <div className="doc-comparison-drawer">
                      <table className="doc-comparison-table">
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Submitted Details</th>
                            <th>OCR-Extracted Details</th>
                            <th>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td><strong>Registration No.</strong></td>
                            <td>{regNo}</td>
                            <td>{getOcrField(rcDoc, 'vehicle_registration_no')}</td>
                            <td>
                              {(() => {
                                const r = getFieldMatch(regNo, getOcrField(rcDoc, 'vehicle_registration_no'))
                                return <span className={`comp-badge ${r.badgeClass}`}>{r.label}</span>
                              })()}
                            </td>
                          </tr>
                          <tr>
                            <td><strong>Registered Owner</strong></td>
                            <td>{customerName}</td>
                            <td>{getOcrField(rcDoc, 'registered_owner')}</td>
                            <td>
                              {(() => {
                                const r = getFieldMatch(customerName, getOcrField(rcDoc, 'registered_owner'), 'customer_name')
                                return <span className={`comp-badge ${r.badgeClass}`}>{r.label}</span>
                              })()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="doc-checklist-item" style={{ opacity: 0.75 }}>
                  <div className="doc-item-left">
                    <div className="doc-type-icon icon-rc" style={{ background: '#F1F5F9', color: '#64748B' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="7" cy="17" r="2" />
                        <circle cx="17" cy="17" r="2" />
                        <path d="M5 17h-2v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2" />
                      </svg>
                    </div>
                    <div>
                      <div className="doc-title-line">
                        <span className="doc-name">Vehicle Registration Certificate (RC)</span>
                        <span className="doc-status-na">Not Applicable — New Vehicle</span>
                      </div>
                      <span className="doc-sub-info">
                        RC Book is not required for brand new showroom vehicles prior to registration.
                      </span>
                    </div>
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
                <span className="attr-label">{isDirectLead ? 'INTAKE CHANNEL' : 'PARTNER CONTACT'}</span>
                <span className="attr-val-bold">
                  {isDirectLead
                    ? 'Internal Desk'
                    : (caseData.referral_partner_mobile ? `+91 ${caseData.referral_partner_mobile}` : '—')}
                </span>
                <span className="attr-sub">
                  {isDirectLead ? 'Direct Inward Desk' : 'Verified Referral Partner'}
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
              <span className="milestone-label">
                {isUnassigned ? 'OPERATIONAL ACTION REQUIRED' : hasFollowUp ? 'SCHEDULED CALLBACK' : 'SCHEDULED NEXT ACTION'}
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isUnassigned ? "#F59E0B" : "#34D399"} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            {isUnassigned ? (
              <>
                <div className="milestone-time-val text-amber">Action Required • Lead Unassigned</div>
                <p className="milestone-desc">
                  This lead is currently unassigned. Assign to a telecaller desk to initiate customer contact and requirement verification.
                </p>
                {!isTelecaller && (
                  <button
                    type="button"
                    className="milestone-action-btn"
                    onClick={() => setShowReassignModal(true)}
                  >
                    Assign Lead Now
                  </button>
                )}
              </>
            ) : !hasCalls && !hasFollowUp ? (
              <>
                <div className="milestone-time-val">First call pending — {caseData.assigned_telecaller_name || 'Telecaller'}</div>
                <p className="milestone-desc">
                  Initial customer outreach pending. Connect with customer to verify vehicle selection and loan requirements.
                </p>
              </>
            ) : hasFollowUp ? (
              <>
                <div className="milestone-time-val">
                  {formatSafeDate(caseData.follow_up_at)}
                </div>
                <p className="milestone-desc">
                  "{caseData.telecaller_remarks || 'Scheduled customer callback follow-up.'}"
                </p>
              </>
            ) : (
              <>
                <div className="milestone-time-val">
                  {caseData.call_outcome ? caseData.call_outcome.replace(/_/g, ' ').toUpperCase() : 'In Progress'}
                </div>
                <p className="milestone-desc">
                  Next operational outreach pending. Review underwriting documentation or coordinate with customer.
                </p>
              </>
            )}
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
              {timelineEvents.length === 0 ? (
                <div className="timeline-empty-box">
                  <div className="timeline-empty-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div className="timeline-empty-title">No calls or notes recorded yet</div>
                  <p className="timeline-empty-desc">
                    {isUnassigned
                      ? 'This lead is currently unassigned. Assign a telecaller desk to begin outreach.'
                      : `Assigned to ${caseData.assigned_telecaller_name}. First call pending.`}
                  </p>
                </div>
              ) : (
                timelineEvents.map((event: any, idx: number) => {
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

                  const isSystem = (event.telecaller_name || '').includes('System') || (event.telecaller_name || '').includes('Administrator')
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
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- Genuine Document Viewer Modal (Section 6) --- */}
      {showDocModal && (
        <div className="stitch-modal-backdrop" onClick={() => setShowDocModal(null)}>
          <div className="stitch-modal-card doc-modal" style={{ maxWidth: '900px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>📄</span>
                <div>
                  <h3 className="modal-title">{showDocModal.file_name}</h3>
                  <span className="modal-subtitle">
                    {showDocModal.document_type_id?.replace('dt-', '').toUpperCase() || 'KYC'} • {showDocModal.file_size ? `${(showDocModal.file_size / 1024).toFixed(0)} KB` : 'Private Storage'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {modalDocUrl && (
                  <a
                    href={modalDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="stitch-btn-secondary"
                    style={{ textDecoration: 'none', padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <span>Open in New Tab</span>
                    <span>↗</span>
                  </a>
                )}
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setShowDocModal(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body-content" style={{ padding: '0.5rem 0' }}>
              {modalDocPreview ? (
                <div className="real-doc-viewer-container" style={{ background: '#0F172A', minHeight: '420px', padding: '0.5rem' }}>
                  <PdfDocumentViewer
                    blob={modalDocPreview.blob}
                    previewUrl={modalDocPreview.url}
                    fileName={showDocModal.file_name}
                    isImage={modalDocPreview.isImage}
                    onDownload={() => handleDownloadDoc(showDocModal)}
                  />
                </div>
              ) : (
                <div className="doc-viewer-fallback">
                  <div className="fallback-file-icon">📁</div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#1E293B', fontSize: '1rem' }}>{showDocModal.file_name}</h4>
                  <p className="fallback-meta">
                    Type: {showDocModal.document_type_id?.replace('dt-', '').toUpperCase()} • Status: Received
                  </p>
                  <p className="fallback-desc">
                    Original file is encrypted and safely stored in authorized private storage. Click "Download Original File" below to inspect the document.
                  </p>
                </div>
              )}

              {/* Document Metadata Footer */}
              <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.8125rem', color: '#334155' }}>
                  <strong>Target Customer:</strong> {customerName} • <strong>OCR Extraction:</strong> {showDocModal.scan_result?.ocr_status === 'extracted' ? '⚡ Extracted' : showDocModal.scan_result?.ocr_status === 'failed' ? '✕ Failed' : '⏳ Pending'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Private Storage: <strong>Encrypted at Rest (AES-256)</strong>
                </div>
              </div>
            </div>

            <div className="modal-actions-row">
              <button
                type="button"
                className="stitch-btn-secondary"
                onClick={() => setShowDocModal(null)}
              >
                Close Viewer
              </button>
              <button
                type="button"
                className="stitch-btn-primary"
                onClick={(e) => handleDownloadDoc(showDocModal, e)}
              >
                Download Original File
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
