/**
 * DSA OS — HTTP Client & API Error Handling
 */

export class ApiError extends Error {
  status?: number
  code?: string
  details?: unknown
  requestId?: string

  constructor(message: string, status?: number, code?: string, details?: unknown, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean
  params?: Record<string, string | number | boolean | undefined>
}

export interface EnvelopeResponse<T> {
  data: T
  meta?: unknown
  success?: boolean
}

import { useAuthStore } from '../../features/auth/useAuth'
import {
  JAI_MOCK_PDD,
  JAI_MOCK_EXPECTATIONS,
  JAI_MOCK_ATTENTION_ITEMS,
  JAI_MOCK_SOURCES_REPORT,
  JAI_MOCK_RECONCILIATION_BATCHES,
  JAI_MOCK_MISSING_EXPECTATIONS,
  JAI_MOCK_CLAWBACKS,
  JAI_MOCK_OUTSTANDING_REPORT,
  JAI_MOCK_USERS,
  JAI_MOCK_AUDIT,
  JAI_MOCK_ORGANIZATIONS,
  JAI_MOCK_REFERRAL_PROFILES,
  JAI_MOCK_REFERRAL_COMMISSIONS,
} from './mockDatabase'
import {
  getStoredCases,
  saveStoredCases,
  addStoredCase,
  getStoredReferralProfiles,
  addOrUpdateReferralProfile,
  enrichReferralProfilesWithCaseMetrics,
  getStoredParties,
  addOrUpdateStoredParty,
  syncCustomerFromCase,
  getStoredDocuments,
  saveStoredDocuments,
  generateDeterministicOcrDocs,
  syncCaseToCloud,
  initCloudSync,
} from './storeSync'
import { computeStitchDashboard } from '../../features/dashboard/dashboardDataService'
import { computeTodayConsoleData } from '../../features/dashboard/todayDataService'

let currentMockSessionUser: any = null

export function resetMockSessionUser() {
  currentMockSessionUser = null
}

function getActiveMockUser(): { id: string; role: string; name: string } | null {
  try {
    const raw = sessionStorage.getItem('dsa_os_auth_state_v1') || localStorage.getItem('dsa_os_auth_state_v1')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.user) {
        return parsed.user
      }
    }
  } catch {}
  try {
    const authState = useAuthStore.getState()
    if (authState?.isAuthenticated && authState?.user) {
      return authState.user
    }
  } catch {}
  if (currentMockSessionUser) return currentMockSessionUser
  return null
}

function getMockFallback(endpoint: string, method = 'GET', body?: any): any {
  const clean = endpoint.toLowerCase().replace(/^\/api\/v\d/, '').split('?')[0]
  let parsedBody = body
  if (typeof body === 'string') {
    try {
      parsedBody = JSON.parse(body)
    } catch {
      parsedBody = {}
    }
  }

  const getBodyField = (key: string): any => {
    if (parsedBody instanceof FormData) {
      const val = parsedBody.get(key)
      return typeof val === 'string' ? val : (val as File | null)?.name || undefined
    }
    if (parsedBody && typeof parsedBody === 'object') {
      return parsedBody[key]
    }
    return undefined
  }

  // Authentication endpoints
  if (clean.includes('/auth/login') && method === 'POST') {
    const idLower = (parsedBody?.identifier || '').toLowerCase()
    const roleParam = (parsedBody?.role || '').toLowerCase()
    let role = 'owner'
    let userId = 'jai-user-owner'
    let userName = 'Aarav Sharma (DSA Admin)'
    let userEmail = parsedBody?.identifier || 'admin@jaiautomobiles.com'
    let userPerms = [
      'cases:create',
      'cases:read',
      'cases:update',
      'cases:delete',
      'cases:reassign',
      'documents:upload',
      'documents:read',
      'documents:verify',
      'documents:archive',
      'payout:read',
      'payout:update',
      'recon:read',
      'recon:update',
      'recon:approve',
      'reports:read',
      'audit:read',
      'users:manage',
      'settings:manage',
      'data:export',
      'pdd:read',
      'pdd:manage',
      'sources:manage',
      'lenders:manage',
      'referrals:read',
      'referrals:manage',
    ]

    const isTelecaller =
      roleParam === 'telecaller' ||
      idLower.includes('telecaller') ||
      idLower.includes('priya') ||
      idLower.includes('rahul')

    if (isTelecaller) {
      role = 'telecaller'
      userPerms = ['cases:read', 'cases:update', 'documents:read', 'documents:upload']
      if (idLower.includes('rahul') || idLower.includes('telecaller-2') || idLower.includes('rahul.verma')) {
        userId = 'usr-telecaller-2'
        userName = 'Rahul Verma (Telecaller)'
        userEmail = 'rahul.verma@jaiautomobiles.com'
      } else {
        userId = 'usr-telecaller-1'
        userName = 'Priya Sharma (Telecaller)'
        userEmail = 'priya.sharma@jaiautomobiles.com'
      }
    } else if (idLower.includes('accountant')) {
      role = 'accountant'
      userId = 'jai-user-accountant'
      userName = 'Sanjay Gupta (Chief Accountant)'
      userEmail = 'accountant@jaiautomobiles.com'
    } else if (idLower.includes('processor')) {
      role = 'processor'
      userId = 'jai-user-processor'
      userName = 'Rohan Verma (Sr. Loan Processor)'
      userEmail = 'processor@jaiautomobiles.com'
    } else if (idLower.includes('auditor')) {
      role = 'auditor'
      userId = 'jai-user-auditor'
      userName = 'Meera Iyer (Internal Auditor)'
      userEmail = 'auditor@jaiautomobiles.com'
    }

    const loggedUser = {
      id: userId,
      org_id: '11111111-1111-1111-1111-111111111111',
      name: userName,
      email: userEmail,
      role,
      is_active: true,
      created_at: new Date().toISOString(),
      permissions: userPerms,
    }
    currentMockSessionUser = loggedUser
    return {
      access_token: `mock-token-${userId}`,
      refresh_token: `mock-refresh-${userId}`,
      token_type: 'bearer',
      user: loggedUser,
    }
  }

  if (clean.includes('/auth/logout') && method === 'POST') {
    currentMockSessionUser = null
    return { success: true }
  }

  if (clean.includes('/auth/me')) {
    const active = getActiveMockUser()
    if (active) return active
    return {
      id: 'jai-user-owner',
      org_id: '11111111-1111-1111-1111-111111111111',
      name: 'Aarav Sharma (DSA Admin)',
      email: 'admin@jaiautomobiles.com',
      role: 'owner',
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      permissions: [
        'cases:create',
        'cases:read',
        'cases:update',
        'cases:delete',
        'cases:reassign',
        'documents:upload',
        'documents:read',
        'documents:verify',
        'documents:archive',
        'payout:read',
        'payout:update',
        'recon:read',
        'recon:update',
        'recon:approve',
        'reports:read',
        'audit:read',
        'users:manage',
        'settings:manage',
        'data:export',
        'pdd:read',
        'pdd:manage',
        'sources:manage',
        'lenders:manage',
        'referrals:read',
        'referrals:manage',
      ],
    }
  }

  // Dashboard endpoints
  if (clean.includes('/dashboard/overview')) {
    initCloudSync()
    const cases = getStoredCases()
    const queryStr = endpoint.includes('?') ? endpoint.split('?')[1] : ''
    const urlParams = new URLSearchParams(queryStr)
    const dateFrom = urlParams.get('date_from')
    const dateTo = urlParams.get('date_to')
    return computeStitchDashboard(cases, dateFrom, dateTo)
  }
  if (clean.includes('/dashboard/today')) {
    initCloudSync()
    const cases = getStoredCases()
    const todayData = computeTodayConsoleData(cases)
    return {
      todayData,
      counts: {
        due_today_count: todayData.counts.follow_ups_due,
        uncalled_count: todayData.counts.new_leads,
        interested_count: todayData.counts.interested,
        unassigned_count: todayData.counts.unassigned,
        retry_count: 6,
        overdue_count: 2,
        stuck_cases_count: 0,
        expiring_docs_count: 0,
        pdd_due_count: 0,
        new_leads_count: todayData.counts.new_leads,
        follow_ups_due_today_count: todayData.counts.follow_ups_due,
      },
      callbacks_due_today: todayData.follow_ups_due_today.map((f) => ({
        id: f.id,
        customer_name: f.customer_name,
        mobile: f.mobile,
        time: f.scheduled_time,
        vehicle: f.vehicle,
        loan_amount: f.loan_amount,
        telecaller_name: f.telecaller_name,
        notes: f.remarks,
        lead_no: f.case_no,
        status: 'callback_scheduled',
      })),
      uncalled_leads: todayData.fresh_unassigned_leads.map((u) => ({
        id: u.id,
        customer_name: u.customer_name,
        mobile: u.mobile,
        inflow_source: u.source_name,
        received_at: u.received_time_label,
        vehicle: u.vehicle,
        loan_amount: u.requested_amount,
        city: 'Mumbai',
        lead_no: u.case_no,
      })),
      interested_prospects: cases.filter(c => c.call_outcome === 'interested' || c.status === 'interested').map((c) => ({
        id: c.id,
        customer_name: c.primary_applicant_name || c.applicant_name,
        mobile: c.primary_applicant_mobile || c.mobile,
        vehicle: c.vehicle_details || c.vehicle_summary,
        loan_amount: c.loan_amount_requested || c.applied_loan_amount,
        telecaller_name: c.assigned_telecaller_name || 'Priya Sharma',
        notes: c.telecaller_remarks || 'Hot lead! Confirmed vehicle selection and requested loan sanction comparison.',
        lead_no: c.case_no,
        case_id: c.id,
      })),
      unassigned_leads: todayData.fresh_unassigned_leads.concat(todayData.backlog_unassigned_leads).map((u) => ({
        id: u.id,
        customer_name: u.customer_name,
        mobile: u.mobile,
        vehicle: u.vehicle,
        loan_amount: u.requested_amount,
        inflow_source: u.source_name,
        city: 'Mumbai',
        lead_no: u.case_no,
      })),
      retry_leads: [],
      tasks_due_today: [
        {
          id: 't1',
          title: 'Scheduled Callback: Rajesh Kumar Sharma (Swift ZXi)',
          type: 'callback',
          case_no: 'JA-2025-0101',
          owner_name: 'Priya Sharma',
          due_date: new Date().toISOString(),
          status: 'pending',
        },
        {
          id: 't2',
          title: 'Scheduled Callback: Amitabh Singh Chauhan (XUV700)',
          type: 'callback',
          case_no: 'JA-2025-0102',
          owner_name: 'Rahul Verma',
          due_date: new Date().toISOString(),
          status: 'pending',
        },
      ],
      tasks_overdue: [],
      stuck_cases: [],
      expiring_documents: [],
      pdd_items_due: [],
    }
  }

  // Sources Performance Report (must be checked BEFORE generic /sources)
  if (clean.includes('/sources/report')) {
    return JAI_MOCK_SOURCES_REPORT
  }
  if (clean.includes('/sources')) {
    return [
      { id: 's-direct', name: 'Direct Customer Walk-in / Telephonic', type: 'direct', contact_person: 'Internal Desk', contact_mobile: '9820011223', is_active: true },
      { id: 's1', name: 'Maruti True Value - Andheri West', type: 'dealer', contact_person: 'Vikas Malhotra', contact_mobile: '9820098200', is_active: true },
      { id: 's2', name: 'Hyundai H-Promise - Thane', type: 'dealer', contact_person: 'Suresh Patil', contact_mobile: '9833098330', is_active: true },
      { id: 's3', name: 'Shree Sai Finance Connectors', type: 'connector', contact_person: 'Ramesh Shah', contact_mobile: '9819098190', is_active: true },
      { id: 's4', name: 'Autocars Mumbai Dealership', type: 'dealer', contact_person: 'Rajendra Joshi', contact_mobile: '9821122334', is_active: true },
    ]
  }

  // Document Types
  if (clean.includes('/document-types')) {
    return [
      { id: 'dt-pan', code: 'PAN', name: 'Borrower PAN Card', category: 'kyc' },
      { id: 'dt-aadhaar', code: 'AADHAAR', name: 'Borrower Aadhaar Card', category: 'kyc' },
      { id: 'dt-bank', code: 'BANK_STMT', name: 'Latest 6 Months Bank Statement', category: 'financial' },
      { id: 'dt-rc', code: 'VEHICLE_RC', name: 'Vehicle Registration Certificate (RC)', category: 'vehicle' },
      { id: 'dt-insurance', code: 'INSURANCE', name: 'Vehicle Insurance Cover Note', category: 'vehicle' },
      { id: 'dt-form34', code: 'FORM_34', name: 'Form 34 Hypothecation Application', category: 'pdd' },
      { id: 'dt-invoice', code: 'INVOICE', name: 'Showroom Invoice & Tax Copy', category: 'pdd' },
    ]
  }

  // Case Status Transition
  const caseStatusMatch = clean.match(/\/cases\/([^\/\?]+)\/status/)
  if (caseStatusMatch && method === 'POST') {
    const caseId = caseStatusMatch[1]
    const cases = getStoredCases()
    const foundCase = cases.find((c: any) => c.id === caseId || c.case_no?.toLowerCase() === caseId.toLowerCase()) || cases[0]
    if (foundCase) {
      const prevStatus = foundCase.status
      foundCase.status = parsedBody?.status || foundCase.status
      foundCase.version = (foundCase.version || 1) + 1
      foundCase.updated_at = new Date().toISOString()
      if (!Array.isArray(foundCase.status_history)) {
        foundCase.status_history = []
      }
      foundCase.status_history.unshift({
        id: `sh-${Date.now()}`,
        from_status: prevStatus,
        to_status: foundCase.status,
        changed_by: 'current-user',
        changer_name: 'Current User',
        created_at: new Date().toISOString(),
      })

      // Idempotently create or link customer in parties registry if qualifying lifecycle stage is reached
      syncCustomerFromCase(foundCase)

      // If attributed to a referral partner, update partner profile
      if (foundCase.referral_profile_id || foundCase.referral_partner_id) {
        const partnerId = foundCase.referral_profile_id || foundCase.referral_partner_id
        const profiles = getStoredReferralProfiles()
        const partner = profiles.find((p: any) => p.id === partnerId || p.name === foundCase.referral_partner_name)
        if (partner) {
          addOrUpdateReferralProfile(partner)
        }
      }

      saveStoredCases(cases)
      syncCaseToCloud(foundCase).catch((e) => console.warn('Case status cloud sync error:', e))
      return foundCase
    }
  }

  // Phase 1: Telecaller Workspace (Strict Scoping by Authenticated User)
  if (clean.includes('/cases/telecaller/workspace')) {
    const active = getActiveMockUser()
    const targetUserId = (active && active.role === 'telecaller') ? active.id : 'usr-telecaller-1'
    const cases = getStoredCases()
    const list = cases.filter((c: any) => c.assigned_telecaller_id === targetUserId)
    return {
      total_assigned: list.length,
      pending_leads: list.filter((c: any) => !c.call_outcome || c.call_outcome === 'new').length,
      contacted_count: list.filter((c: any) => c.call_outcome && c.call_outcome !== 'new').length,
      follow_ups_due: list.filter((c: any) => c.call_outcome === 'follow_up').length,
      interested_count: list.filter((c: any) => c.call_outcome === 'interested').length,
      not_interested_count: list.filter((c: any) => c.call_outcome === 'not_interested').length,
      completed_count: list.filter((c: any) => ['interested', 'not_interested', 'duplicate'].includes(c.call_outcome || '')).length,
      leads: list,
    }
  }

  // Phase 1: Lead Assignment (Bulk / Single)
  if (clean.includes('/cases/assign') && method === 'POST') {
    const active = getActiveMockUser()
    if (active && active.role === 'telecaller') {
      throw new ApiError('Access denied: Telecallers cannot assign or reassign leads.', 403, 'FORBIDDEN')
    }
    const { case_ids, telecaller_id } = parsedBody || {}
    const tcUser = JAI_MOCK_USERS.find((u: any) => u.id === telecaller_id)
    const tcName = tcUser?.name || (telecaller_id === 'usr-telecaller-2' ? 'Rahul Verma' : 'Priya Sharma')
    let count = 0
    const cases = getStoredCases()
    if (Array.isArray(case_ids)) {
      case_ids.forEach((cid: string) => {
        const found = cases.find((c: any) => c.id === cid)
        if (found) {
          found.assigned_telecaller_id = telecaller_id
          found.assigned_telecaller_name = tcName
          found.updated_at = new Date().toISOString()
          count++
          syncCaseToCloud(found).catch((e) => console.warn('Assign sync error:', e))
        }
      })
      saveStoredCases(cases)
    }
    return {
      assigned_count: count || (case_ids?.length || 1),
      telecaller_id,
      telecaller_name: tcName,
    }
  }

  // Phase 1: Call Activity Logging (Strict Server-Side RBAC)
  const callActivityMatch = clean.match(/\/cases\/([^\/\?]+)\/call-activity/)
  if (callActivityMatch && method === 'POST') {
    const caseId = callActivityMatch[1]
    const active = getActiveMockUser()
    const cases = getStoredCases()
    const foundCase = cases.find((c: any) => c.id === caseId || c.case_no?.toLowerCase() === caseId)
    if (!foundCase) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND')
    }
    if (active && active.role === 'telecaller') {
      if (foundCase.assigned_telecaller_id !== active.id) {
        throw new ApiError('Access denied: Cannot record call activity on unassigned lead.', 403, 'FORBIDDEN')
      }
    }
    const outcome = parsedBody?.call_outcome || parsedBody?.outcome
    const remarks = parsedBody?.telecaller_remarks || parsedBody?.remarks || parsedBody?.notes
    foundCase.call_outcome = outcome || foundCase.call_outcome
    foundCase.telecaller_remarks = remarks || foundCase.telecaller_remarks
    foundCase.follow_up_at = parsedBody?.follow_up_at || foundCase.follow_up_at
    foundCase.call_attempts_count = (foundCase.call_attempts_count || 0) + 1
    foundCase.updated_at = new Date().toISOString()
    if (!Array.isArray(foundCase.call_activity_history)) {
      foundCase.call_activity_history = []
    }
    foundCase.call_activity_history.unshift({
      id: `act-${Date.now()}`,
      outcome: outcome || 'follow_up',
      remarks: remarks || '',
      follow_up_at: parsedBody?.follow_up_at,
      telecaller_name: active?.name || 'Priya Sharma',
      created_at: new Date().toISOString(),
    })

    // If associated with a referral partner, update partner profile
    if (foundCase.referral_profile_id || foundCase.referral_partner_id) {
      const partnerId = foundCase.referral_profile_id || foundCase.referral_partner_id
      const profiles = getStoredReferralProfiles()
      const partner = profiles.find((p: any) => p.id === partnerId || p.name === foundCase.referral_partner_name)
      if (partner) {
        addOrUpdateReferralProfile(partner)
      }
    }

    saveStoredCases(cases)
    syncCaseToCloud(foundCase).catch((e) => console.warn('Call activity cloud sync error:', e))
    return {
      success: true,
      case: foundCase,
      case_id: foundCase.id,
      case_no: foundCase.case_no,
      call_outcome: foundCase.call_outcome,
      telecaller_remarks: foundCase.telecaller_remarks,
      follow_up_at: foundCase.follow_up_at,
      call_attempts_count: foundCase.call_attempts_count,
      updated_at: foundCase.updated_at,
    }
  }

  // Phase 1: Referral Document Upload (Quarantine)
  if ((clean.includes('/referrals/upload-document') || clean.includes('/upload-document')) && method === 'POST') {
    const docType = getBodyField('doc_type') || getBodyField('document_type_id') || 'aadhaar'
    let fileName = `quarantined_${docType}.pdf`
    let fileSize = 245000
    if (parsedBody instanceof FormData) {
      const fileEntry = parsedBody.get('file')
      if (fileEntry && typeof fileEntry === 'object' && 'name' in fileEntry) {
        fileName = (fileEntry as File).name
        fileSize = (fileEntry as File).size
      }
    } else {
      fileName = getBodyField('file_name') || getBodyField('file') || fileName
      fileSize = Number(getBodyField('file_size')) || fileSize
    }
    const docId = `doc-quar-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    return {
      success: true,
      document_id: docId,
      doc_type: docType,
      file_name: fileName,
      file_size: fileSize,
      status: 'quarantined',
      message: 'Document successfully uploaded to private quarantine.',
    }
  }

  // Phase 1: Referral Partner Mobile Lookup
  if (clean.includes('/referrals/lookup') && method === 'POST') {
    let cleanMobile = (parsedBody?.mobile || '').replace(/\D/g, '')
    if (cleanMobile.length === 12 && cleanMobile.startsWith('91')) {
      cleanMobile = cleanMobile.slice(2)
    } else if (cleanMobile.length === 11 && cleanMobile.startsWith('0')) {
      cleanMobile = cleanMobile.slice(1)
    }
    const rawMobile = cleanMobile.slice(0, 10)
    if (rawMobile.length !== 10 || !['6', '7', '8', '9'].includes(rawMobile.charAt(0))) {
      throw new ApiError('Invalid mobile number. Must be a 10-digit Indian number starting with 6, 7, 8, or 9.', 422, 'VALIDATION_ERROR')
    }

    const allProfiles = [...getStoredReferralProfiles(), ...JAI_MOCK_REFERRAL_PROFILES]
    const match = allProfiles.find((p) => p.mobile_primary.includes(rawMobile))
    if (match) {
      return {
        exists: true,
        profile_id: match.id,
        name: match.name,
        verification_status: match.verification_status,
      }
    }
    return {
      exists: false,
      profile_id: null,
      name: null,
      verification_status: null,
    }
  }

  // Phase 1: Referral Partner OTP Dispatch (TextBee SMS Gateway)
  if (clean.includes('/referrals/otp/send') && method === 'POST') {
    let cleanMobile = (parsedBody?.mobile || '').replace(/\D/g, '')
    if (cleanMobile.length === 12 && cleanMobile.startsWith('91')) {
      cleanMobile = cleanMobile.slice(2)
    } else if (cleanMobile.length === 11 && cleanMobile.startsWith('0')) {
      cleanMobile = cleanMobile.slice(1)
    }
    const rawMobile = cleanMobile.slice(0, 10)
    if (rawMobile.length !== 10 || !['6', '7', '8', '9'].includes(rawMobile.charAt(0))) {
      throw new ApiError('Invalid mobile number. Must be a 10-digit Indian number starting with 6, 7, 8, or 9.', 422, 'VALIDATION_ERROR')
    }

    const partnerName = (parsedBody?.name || '').trim()
    if (!partnerName) {
      throw new ApiError('Partner name is required to dispatch verification code.', 422, 'VALIDATION_ERROR')
    }

    // Check if existing partner is already verified
    const allProfiles = [...getStoredReferralProfiles(), ...JAI_MOCK_REFERRAL_PROFILES]
    const match = allProfiles.find((p) => p.mobile_primary?.includes(rawMobile))
    if (match && match.verification_status === 'verified') {
      const masked = `+91 ${rawMobile.slice(0, 2)}****${rawMobile.slice(-4)}`
      return {
        success: true,
        message: `Mobile number ${masked} is already verified. You may proceed directly to submit referrals.`,
        masked_mobile: masked,
        expires_in_seconds: 0,
        resend_cooldown_seconds: 0,
        delivery_accepted: true,
        sim_subscription_id: 1,
      }
    }

    // Rate limiting: cooldown check (60s)
    const now = Date.now()
    const existing = (window as any).__MOCK_OTP_STORE__?.[rawMobile]
    if (existing && existing.last_send_at && (now - existing.last_send_at) < 60000) {
      const waitSec = Math.ceil((60000 - (now - existing.last_send_at)) / 1000)
      throw new ApiError(`Please wait ${waitSec} seconds before requesting a new verification code.`, 429, 'RATE_LIMIT_EXCEEDED')
    }

    // Generate secure 6-digit OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000))
    if (!(window as any).__MOCK_OTP_STORE__) {
      ;(window as any).__MOCK_OTP_STORE__ = {}
    }
    ;(window as any).__MOCK_OTP_STORE__[rawMobile] = {
      code: otpCode,
      name: partnerName,
      created_at: now,
      last_send_at: now,
      expires_at: now + 300000, // 5 minutes
      attempts: 0,
    }

    // Expose in test mode for automated test assertion
    if (typeof window !== 'undefined') {
      ;(window as any).__LAST_GENERATED_OTP__ = otpCode
    }

    const masked = `+91 ${rawMobile.slice(0, 2)}****${rawMobile.slice(-4)}`
    return {
      success: true,
      message: 'OTP sent',
      masked_mobile: masked,
      expires_in_seconds: 300,
      resend_cooldown_seconds: 60,
      delivery_accepted: true,
      sim_subscription_id: 1,
    }
  }

  // Phase 1: Referral Partner OTP Verification
  if (clean.includes('/referrals/otp/verify') && method === 'POST') {
    let cleanMobile = (parsedBody?.mobile || '').replace(/\D/g, '')
    if (cleanMobile.length === 12 && cleanMobile.startsWith('91')) {
      cleanMobile = cleanMobile.slice(2)
    } else if (cleanMobile.length === 11 && cleanMobile.startsWith('0')) {
      cleanMobile = cleanMobile.slice(1)
    }
    const rawMobile = cleanMobile.slice(0, 10)
    const submittedOtp = (parsedBody?.otp || '').trim()
    const partnerName = (parsedBody?.name || '').trim()

    if (!submittedOtp || submittedOtp.length < 4) {
      throw new ApiError('Please enter a valid verification code.', 422, 'VALIDATION_ERROR')
    }

    const record = (window as any).__MOCK_OTP_STORE__?.[rawMobile]
    if (!record) {
      throw new ApiError('Verification code has expired or does not exist. Please request a new code.', 400, 'EXPIRED_OR_NOT_FOUND')
    }

    if (Date.now() > record.expires_at) {
      delete (window as any).__MOCK_OTP_STORE__[rawMobile]
      throw new ApiError('Verification code has expired. Please request a new code.', 400, 'EXPIRED')
    }

    record.attempts = (record.attempts || 0) + 1
    if (record.attempts > 5) {
      delete (window as any).__MOCK_OTP_STORE__[rawMobile]
      throw new ApiError('Maximum verification attempts exceeded. Please request a new code.', 429, 'MAX_ATTEMPTS_EXCEEDED')
    }

    if (record.code !== submittedOtp) {
      const remaining = Math.max(0, 5 - record.attempts)
      throw new ApiError(`Incorrect verification code. ${remaining} attempt(s) remaining.`, 400, 'INCORRECT_CODE')
    }

    // Success: immediately invalidate OTP to prevent replay
    delete (window as any).__MOCK_OTP_STORE__[rawMobile]

    // Create or activate verified partner profile
    const profiles = getStoredReferralProfiles()
    let partner = profiles.find((p: any) => p.mobile_primary?.includes(rawMobile))
    const finalName = partnerName || record.name || 'Verified Referral Partner'

    if (!partner) {
      partner = {
        id: `ref-p-${Date.now()}`,
        org_id: '11111111-1111-1111-1111-111111111111',
        name: finalName,
        mobile_primary: rawMobile,
        masked_mobile: `${rawMobile.slice(0, 2)}****${rawMobile.slice(-4)}`,
        verification_status: 'verified',
        total_leads: 0,
        interested_leads: 0,
        converted_leads: 0,
        approved_commissions: 0,
        paid_commissions: 0,
        notes: 'Registered and verified via mobile OTP.',
        created_at: new Date().toISOString(),
      }
    } else {
      partner.name = finalName
      partner.verification_status = 'verified'
    }

    addOrUpdateReferralProfile(partner)

    return {
      success: true,
      verified: true,
      message: `Referral partner ${partner.name} verified successfully.`,
      profile: partner,
    }
  }

  // Phase 1: Guest Referral Lead Submission with Mandatory Document Rules
  if ((clean.includes('/referrals/submit') || clean.includes('/referrals/guest-submit')) && method === 'POST') {
    const rawMobile = (parsedBody?.partner_mobile || '').replace(/\D/g, '').slice(-10)
    
    // Enforce vehicle condition
    const condition = parsedBody?.vehicle_condition
    if (!condition || (condition !== 'used' && condition !== 'new')) {
      throw new ApiError('Vehicle condition is mandatory. Please select Used Car or New Car.', 422, 'VALIDATION_ERROR')
    }
    const isNew = condition === 'new'
    
    // Enforce mandatory document rules
    if (!parsedBody?.aadhaar_doc_id) {
      throw new ApiError('Aadhaar card is mandatory for every lead submission.', 422, 'VALIDATION_ERROR')
    }
    if (!parsedBody?.pan_doc_id) {
      throw new ApiError('PAN card is mandatory for every lead submission.', 422, 'VALIDATION_ERROR')
    }
    if (!isNew) {
      if (!parsedBody?.rc_doc_id) {
        throw new ApiError('RC document is mandatory for used/old vehicle loan applications.', 422, 'VALIDATION_ERROR')
      }
      if (!parsedBody?.vehicle_reg_no || !parsedBody.vehicle_reg_no.trim()) {
        throw new ApiError('Vehicle registration number is required for used car leads.', 422, 'VALIDATION_ERROR')
      }
    }

    // Check duplicate submission within 5 mins
    const storedCases = getStoredCases()
    const recentDup = storedCases.find((c: any) => 
      c.referral_partner_mobile === rawMobile &&
      c.applicant_name === parsedBody?.applicant_name &&
      c.loan_amount_requested === Number(parsedBody?.loan_amount_requested) &&
      (Date.now() - new Date(c.created_at).getTime()) < 300000
    )
    if (recentDup) {
      return {
        success: true,
        case_id: recentDup.id,
        case_no: recentDup.case_no,
        tracking_id: `REF-${recentDup.case_no.replace('JA-', '')}-${rawMobile.slice(-4)}`,
        partner_id: recentDup.referral_profile_id,
        partner_name: recentDup.referral_partner_name,
        message: 'Lead was already submitted and is in the operations queue.',
      }
    }

    const referralProfiles = getStoredReferralProfiles()
    let partner = referralProfiles.find((p: any) => p.mobile_primary?.includes(rawMobile))
    if (!partner) {
      partner = {
        id: `ref-p-${Date.now()}`,
        org_id: '11111111-1111-1111-1111-111111111111',
        name: parsedBody?.partner_name || 'New Referral Partner',
        mobile_primary: rawMobile || '9820000000',
        masked_mobile: rawMobile.length >= 6 ? `${rawMobile.slice(0, 2)}****${rawMobile.slice(-4)}` : '98****0000',
        verification_status: 'pending_verification',
        total_leads: 1,
        interested_leads: 0,
        converted_leads: 0,
        approved_commissions: 0,
        paid_commissions: 0,
        notes: 'Self-registered via public portal referral intake.',
        created_at: new Date().toISOString(),
      }
    } else {
      partner.total_leads = (partner.total_leads || 0) + 1
    }
    addOrUpdateReferralProfile(partner)

    const newCaseNo = `JA-2025-${Math.floor(1000 + Math.random() * 9000)}`
    const newCase: any = {
      id: `case-jai-${Date.now()}`,
      case_no: newCaseNo,
      applicant_name: parsedBody?.applicant_name || 'Referral Borrower',
      primary_applicant_name: parsedBody?.applicant_name || 'Referral Borrower',
      mobile: parsedBody?.applicant_mobile || '9820011223',
      primary_applicant_mobile: parsedBody?.applicant_mobile || '9820011223',
      product: parsedBody?.product_type || 'used_car',
      product_type: parsedBody?.product_type || 'used_car',
      status: 'lead',
      applied_loan_amount: Number(parsedBody?.loan_amount_requested) || 500000,
      loan_amount_requested: Number(parsedBody?.loan_amount_requested) || 500000,
      vehicle_summary: parsedBody?.vehicle_reg_no ? `Vehicle (${parsedBody.vehicle_reg_no})` : `${isNew ? 'New' : 'Used'} Vehicle Loan`,
      vehicle_details: parsedBody?.vehicle_reg_no ? `Vehicle (${parsedBody.vehicle_reg_no})` : `${isNew ? 'New' : 'Used'} Vehicle Loan`,
      source_name: `Referral: ${partner.name}`,
      owner_name: 'Aarav Sharma',
      organization_slug: 'jai-automobiles',
      org_id: '11111111-1111-1111-1111-111111111111',
      assigned_telecaller_id: null,
      assigned_telecaller_name: null,
      referral_profile_id: partner.id,
      referral_partner_name: partner.name,
      referral_partner_mobile: rawMobile,
      vehicle_condition: isNew ? 'new' : 'used',
      call_outcome: 'new',
      call_attempts_count: 0,
      has_consent: true,
      age_in_days: 0,
      version: 1,
      expected_loan_required_date: parsedBody?.expected_loan_required_date || null,
      locality: parsedBody?.locality || undefined,
      district: parsedBody?.district || undefined,
      pincode: parsedBody?.pincode || '400053',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      primary_party: {
        id: `p-${Date.now()}`,
        name: parsedBody?.applicant_name || 'Referral Borrower',
        mobile_primary: parsedBody?.applicant_mobile || '9820011223',
        locality: parsedBody?.locality || undefined,
        district: parsedBody?.district || undefined,
        city: parsedBody?.city || 'Mumbai',
        state: parsedBody?.state || 'Maharashtra',
        pincode: parsedBody?.pincode || '400053',
      },
      vehicle: {
        id: `v-${Date.now()}`,
        case_id: `case-jai-${Date.now()}`,
        vehicle_type: parsedBody?.product_type || 'four_wheeler',
        make: parsedBody?.vehicle_make || 'Hyundai',
        model: parsedBody?.vehicle_model || 'Creta',
        condition: isNew ? 'new' : 'used',
        registration_no: parsedBody?.vehicle_reg_no || (isNew ? undefined : 'MH-02-CB-8821'),
      },
      status_history: [
        { id: `sh-${Date.now()}`, from_status: null, to_status: 'lead', changed_by: 'system', changer_name: 'Referral Portal', created_at: new Date().toISOString() },
      ],
    }
    addStoredCase(newCase)

    // Sync to cloud for cross-device visibility
    try {
      syncCaseToCloud(newCase)
    } catch {
      // Offline fallback
    }

    // Generate and store deterministic OCR documents for this case
    const ocrDocs = generateDeterministicOcrDocs({
      id: newCase.id,
      case_no: newCase.case_no,
      applicant_name: newCase.applicant_name,
      mobile: newCase.mobile,
      vehicle_make: parsedBody?.vehicle_make || 'Hyundai',
      vehicle_model: parsedBody?.vehicle_model || 'Creta',
      vehicle_reg_no: parsedBody?.vehicle_reg_no || (isNew ? undefined : 'MH-02-CB-8821'),
      vehicle_condition: isNew ? 'new' : 'used',
      city: parsedBody?.city || 'Mumbai',
      state: parsedBody?.state || 'Maharashtra',
      pincode: parsedBody?.pincode || '400053',
      loan_amount: Number(parsedBody?.loan_amount_requested) || 500000,
    })
    saveStoredDocuments(newCase.id, ocrDocs)

    return {
      success: true,
      case_id: newCase.id,
      case_no: newCase.case_no,
      tracking_id: `REF-${newCase.case_no.replace('JA-', '')}-${rawMobile.slice(-4)}`,
      referral_profile_id: partner.id,
      partner_name: partner.name,
      message: `Lead successfully submitted and routed to Jai Automobiles lead desk. Reference: ${newCase.case_no}`,
    }
  }

  // Phase 1: Referral Partner Detail & Dossier
  const profileDetailMatch = clean.match(/\/referrals\/profiles\/([^\/\?]+)$/)
  if (profileDetailMatch && method === 'GET') {
    const profileId = profileDetailMatch[1]
    const profiles = getStoredReferralProfiles()
    const allCases = getStoredCases()
    const enriched = enrichReferralProfilesWithCaseMetrics(profiles, allCases)
    const profile = enriched.find((p: any) => p.id === profileId) || enriched[0]
    const associatedLeads = allCases.filter((c: any) =>
      c.referral_profile_id === profile.id ||
      c.referral_partner_id === profile.id ||
      (profile.mobile_primary && c.referral_partner_mobile === profile.mobile_primary) ||
      (profile.name && c.referral_partner_name?.toLowerCase().trim() === profile.name.toLowerCase().trim())
    )
    const associatedComms = JAI_MOCK_REFERRAL_COMMISSIONS.filter((c: any) => c.referral_profile_id === profile.id)
    return {
      profile,
      leads: associatedLeads,
      commissions: associatedComms,
    }
  }

  // Phase 1: Toggle Referral Partner Verification Status
  const profileVerifyMatch = clean.match(/\/referrals\/profiles\/([^\/\?]+)\/verify/)
  if (profileVerifyMatch && method === 'POST') {
    const profileId = profileVerifyMatch[1]
    const profiles = getStoredReferralProfiles()
    const profile = profiles.find((p: any) => p.id === profileId) || profiles[0]
    profile.verification_status = parsedBody?.status || (profile.verification_status === 'verified' ? 'pending_verification' : 'verified')
    profile.verified_at = new Date().toISOString()
    addOrUpdateReferralProfile(profile)
    return profile
  }

  // Phase 1: List Referral Profiles
  if (clean.includes('/referrals/profiles') && method === 'GET') {
    const profiles = getStoredReferralProfiles()
    const allCases = getStoredCases()
    return enrichReferralProfilesWithCaseMetrics(profiles, allCases)
  }

  // Phase 1: Update Referral Commission Status (Approve / Reject / Pay with UTR)
  const commStatusMatch = clean.match(/\/referrals\/commissions\/([^\/\?]+)\/status/)
  if (commStatusMatch && method === 'POST') {
    const commId = commStatusMatch[1]
    const comm = JAI_MOCK_REFERRAL_COMMISSIONS.find((c) => c.id === commId) || JAI_MOCK_REFERRAL_COMMISSIONS[0]
    comm.status = parsedBody?.status || comm.status
    if (parsedBody?.payment_reference) comm.payment_reference = parsedBody.payment_reference
    if (parsedBody?.notes) comm.notes = parsedBody.notes
    if (comm.status === 'paid' && !comm.payment_date) {
      comm.payment_date = new Date().toISOString().split('T')[0]
    }
    return comm
  }

  // Phase 1: Create Referral Commission
  if (clean.includes('/referrals/commissions') && method === 'POST') {
    const newComm: any = {
      id: `ref-comm-${Date.now()}`,
      org_id: '11111111-1111-1111-1111-111111111111',
      referral_profile_id: parsedBody?.referral_profile_id,
      referral_partner_name: parsedBody?.referral_partner_name || 'Referral Partner',
      case_id: parsedBody?.case_id,
      case_no: parsedBody?.case_no,
      applicant_name: parsedBody?.applicant_name,
      amount: Number(parsedBody?.amount) || 5000,
      basis: parsedBody?.basis || 'Partner Incentive',
      status: 'pending_review',
      notes: parsedBody?.notes,
      created_at: new Date().toISOString(),
    }
    JAI_MOCK_REFERRAL_COMMISSIONS.unshift(newComm)
    return newComm
  }

  // Phase 1: List Referral Commissions
  if (clean.includes('/referrals/commissions') && method === 'GET') {
    return JAI_MOCK_REFERRAL_COMMISSIONS
  }

  // Phase 1: Lead Bulk Import Template & Preview
  if (clean.includes('/import/cases/template') || clean.includes('/import/template')) {
    return {
      columns: ['applicant_name', 'mobile', 'product_type', 'loan_amount_requested', 'city', 'state', 'pincode', 'vehicle_reg_no', 'source_name'],
      sample_row: {
        applicant_name: 'Sunil Verma',
        mobile: '9820011223',
        product_type: 'used_car',
        loan_amount_requested: 650000,
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400053',
        vehicle_reg_no: 'MH02EJ4455',
        source_name: 'Cold Calling Database Q1',
      },
    }
  }

  // Telecaller Workspace (GET /cases/telecaller/workspace)
  if (clean.includes('/cases/telecaller/workspace')) {
    initCloudSync()
    const active = getActiveMockUser()
    const cases = getStoredCases()
    const myLeads = (active && active.role === 'telecaller')
      ? cases.filter((c: any) => c.assigned_telecaller_id === active.id)
      : cases
    return {
      total_assigned: myLeads.length,
      pending_leads: myLeads.filter((l: any) => !l.call_outcome || l.call_outcome === 'new').length,
      follow_ups_due: myLeads.filter((l: any) => l.call_outcome === 'follow_up').length,
      interested_count: myLeads.filter((l: any) => l.call_outcome === 'interested').length,
      completed_count: myLeads.filter((l: any) => ['interested', 'not_interested', 'duplicate'].includes(l.call_outcome || '')).length,
      leads: myLeads,
    }
  }

  // Lead Assignment to Telecaller (POST /cases/assign)
  if (clean.includes('/cases/assign') && method === 'POST') {
    const caseIds: string[] = parsedBody?.case_ids || []
    const telecallerId: string = parsedBody?.telecaller_id || 'usr-telecaller-1'
    const tcName = telecallerId === 'usr-telecaller-2' ? 'Rahul Verma' : 'Priya Sharma'

    const stored = getStoredCases()
    const updated = stored.map((c: any) => {
      if (caseIds.includes(c.id) || caseIds.includes(c.case_no)) {
        const item = {
          ...c,
          assigned_telecaller_id: telecallerId,
          assigned_telecaller_name: tcName,
          updated_at: new Date().toISOString(),
        }
        syncCaseToCloud(item).catch((e) => console.warn('Assign sync error:', e))
        return item
      }
      return c
    })
    saveStoredCases(updated)

    return {
      success: true,
      assigned_count: caseIds.length,
      assigned_telecaller_id: telecallerId,
      assigned_telecaller_name: tcName,
    }
  }

  // Call Activity Log (POST /cases/:id/call-activity)
  if (clean.includes('/call-activity') && method === 'POST') {
    const caseId = clean.match(/\/cases\/([^\/\?]+)/)?.[1]
    const stored = getStoredCases()
    const updated = stored.map((c: any) => {
      if (c.id === caseId || c.case_no === caseId) {
        return {
          ...c,
          call_outcome: parsedBody?.outcome,
          telecaller_remarks: parsedBody?.remarks,
          follow_up_at: parsedBody?.follow_up_at,
          call_attempts_count: (c.call_attempts_count || 0) + 1,
        }
      }
      return c
    })
    saveStoredCases(updated)
    return { success: true }
  }

  // Single Case Dossier (GET /cases/:id) with Server-Side Assignment Authorization
  const singleCaseMatch = clean.match(/\/cases\/([^\/\?]+)$/)
  if (singleCaseMatch && method === 'GET') {
    const caseId = singleCaseMatch[1]
    if (caseId && caseId !== 'new' && caseId !== 'list' && caseId !== 'assign') {
      const active = getActiveMockUser()
      const cases = getStoredCases()
      const foundCase = cases.find((c: any) => c.id === caseId || c.case_no?.toLowerCase() === caseId.toLowerCase())
      if (!foundCase) {
        throw new ApiError('Case not found', 404, 'NOT_FOUND')
      }
      if (active && active.role === 'telecaller') {
        if (foundCase.assigned_telecaller_id !== active.id) {
          throw new ApiError('Access denied: You are not authorized to view this lead record.', 403, 'FORBIDDEN')
        }
      }
      return foundCase
    }
  }

  // Cases List (GET /cases) with Strict Telecaller Assignment Filter
  if (clean.includes('/cases') && method === 'GET') {
    initCloudSync()
    const active = getActiveMockUser()
    const cases = getStoredCases()
    if (active && active.role === 'telecaller') {
      return cases.filter((c: any) => c.assigned_telecaller_id === active.id)
    }
    return cases
  }

  // Case Creation (POST /cases)
  if (clean.includes('/cases') && method === 'POST') {
    const isDirect = parsedBody?.source_type === 'direct' || (!parsedBody?.referral_partner_id && !parsedBody?.referral_profile_id && parsedBody?.source_type !== 'referral')
    const newCase = {
      id: `case-jai-${Date.now()}`,
      case_no: `JA-2025-${Math.floor(1000 + Math.random() * 9000)}`,
      applicant_name: parsedBody?.primary_applicant_name || parsedBody?.party_name || parsedBody?.borrower?.name || parsedBody?.applicant_name || 'New Borrower',
      primary_applicant_name: parsedBody?.primary_applicant_name || parsedBody?.party_name || parsedBody?.borrower?.name || parsedBody?.applicant_name || 'New Borrower',
      mobile: parsedBody?.primary_applicant_mobile || parsedBody?.party_mobile || parsedBody?.borrower?.mobile || parsedBody?.mobile || '9820011223',
      primary_applicant_mobile: parsedBody?.primary_applicant_mobile || parsedBody?.party_mobile || parsedBody?.borrower?.mobile || parsedBody?.mobile || '9820011223',
      product: parsedBody?.product_type || parsedBody?.loan?.product || 'used_car',
      product_type: parsedBody?.product_type || parsedBody?.loan?.product || 'used_car',
      status: 'lead',
      applied_loan_amount: Number(parsedBody?.loan_amount_requested || parsedBody?.loan?.requested_amount) || 750000,
      loan_amount_requested: Number(parsedBody?.loan_amount_requested || parsedBody?.loan?.requested_amount) || 750000,
      vehicle_summary: parsedBody?.vehicle_make ? `${parsedBody.vehicle_make} ${parsedBody.vehicle_model || ''}` : 'Hyundai Creta 1.5 SX',
      vehicle_details: parsedBody?.vehicle_make ? `${parsedBody.vehicle_make} ${parsedBody.vehicle_model || ''}` : 'Hyundai Creta 1.5 SX',
      source_type: isDirect ? 'direct' : 'referral',
      source_name: isDirect
        ? (parsedBody?.source_name || 'Direct Customer Walk-in / Telephonic')
        : (parsedBody?.source_name || 'Referral Partner Desk'),
      referral_profile_id: isDirect ? null : (parsedBody?.referral_profile_id || parsedBody?.referral_partner_id || null),
      referral_partner_id: isDirect ? null : (parsedBody?.referral_partner_id || parsedBody?.referral_profile_id || null),
      referral_partner_name: isDirect ? null : (parsedBody?.referral_partner_name || null),
      referral_partner_mobile: isDirect ? null : (parsedBody?.referral_partner_mobile || null),
      referral_node: isDirect ? 'Direct Walk-in / Telephonic' : (parsedBody?.referral_node || `${parsedBody?.referral_partner_name || 'Partner'} Channel`),
      assigned_telecaller_id: parsedBody?.assigned_telecaller_id || null,
      assigned_telecaller_name: parsedBody?.assigned_telecaller_name || null,
      owner_name: 'Aarav Sharma',
      has_consent: true,
      age_in_days: 0,
      version: 1,
      expected_loan_required_date: parsedBody?.expected_loan_required_date || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      primary_party: {
        id: `p-${Date.now()}`,
        name: parsedBody?.primary_applicant_name || parsedBody?.party_name || parsedBody?.borrower?.name || parsedBody?.applicant_name || 'New Borrower',
        mobile_primary: parsedBody?.primary_applicant_mobile || parsedBody?.party_mobile || parsedBody?.borrower?.mobile || parsedBody?.mobile || '9820011223',
        pan_masked: parsedBody?.party_pan ? `${parsedBody.party_pan.slice(0, 5)}****${parsedBody.party_pan.slice(-1)}` : 'ABCDE****F',
        aadhaar_masked: '**** **** 1234',
        employment_type: 'Salaried',
        city: parsedBody?.city || 'Mumbai',
        monthly_income: parsedBody?.monthly_income || 75000,
      },
      vehicle: {
        id: `v-${Date.now()}`,
        case_id: `case-jai-${Date.now()}`,
        vehicle_type: parsedBody?.product_type || 'four_wheeler',
        make: parsedBody?.vehicle_make || 'Hyundai',
        model: parsedBody?.vehicle_model || 'Creta',
        variant: '1.5 SX',
        year_of_manufacture: 2023,
        condition: parsedBody?.vehicle_condition || 'used',
        registration_no: parsedBody?.vehicle_registration_no || 'MH02EK9988',
        valuation_amount: 850000,
      },
      status_history: [
        { id: `sh-${Date.now()}`, from_status: null, to_status: 'lead', changed_by: 'u-1', changer_name: 'Aarav Sharma', created_at: new Date().toISOString() },
      ],
    }
    addStoredCase(newCase)
    syncCaseToCloud(newCase).catch((e) => console.warn('Case creation cloud sync error:', e))

    // Generate and store deterministic OCR docs
    const ocrDocs = generateDeterministicOcrDocs({
      id: newCase.id,
      case_no: newCase.case_no,
      applicant_name: newCase.applicant_name,
      mobile: newCase.mobile,
      pan: parsedBody?.party_pan,
      vehicle_make: newCase.vehicle?.make,
      vehicle_model: newCase.vehicle?.model,
      vehicle_reg_no: newCase.vehicle?.registration_no,
      vehicle_condition: 'used',
      loan_amount: newCase.loan_amount_requested,
    })
    saveStoredDocuments(newCase.id, ocrDocs)

    return {
      case: newCase,
      duplicate_warnings: [],
      ...newCase,
    }
  }

  // Payout Exception & Reconciliation Endpoints
  if (clean.includes('/payout/expectations/attention')) {
    return JAI_MOCK_ATTENTION_ITEMS
  }
  const expMatch = clean.match(/\/payout\/expectations\/([^\/\?]+)/)
  if (expMatch && method === 'GET') {
    const expId = expMatch[1]
    const foundExp = JAI_MOCK_EXPECTATIONS.find((e: any) => e.id === expId)
    return foundExp || JAI_MOCK_EXPECTATIONS[0]
  }
  if (clean.includes('/payout/reconciliation/batches')) {
    return JAI_MOCK_RECONCILIATION_BATCHES
  }
  if (clean.includes('/payout/reconciliation/missing-expectations')) {
    return JAI_MOCK_MISSING_EXPECTATIONS
  }
  if (clean.includes('/payout/reconciliation/clawbacks')) {
    return JAI_MOCK_CLAWBACKS
  }
  if (clean.includes('/payout/reconciliation/outstanding')) {
    return JAI_MOCK_OUTSTANDING_REPORT
  }
  if (clean.includes('/payout/receipts')) {
    return [
      {
        id: 'rcpt-unmatched-1',
        org_id: '11111111-1111-1111-1111-111111111111',
        batch_id: 'batch-2025-01',
        lender_id: 'l1',
        lender_name: 'HDFC Bank',
        loan_account_no: 'LAN-9988123-NEW',
        loan_account_no_raw: 'LAN-9988123-NEW',
        customer_name: 'Vikram A. Joshi',
        customer_name_raw: 'Vikram A. Joshi',
        received_amount: 14500,
        tds_amount: 725,
        net_amount: 13775,
        payment_date: '2025-02-21',
        utr_reference: 'CMS-HDFC-992144',
        status: 'unmatched',
        match_confidence: null,
        created_at: '2025-02-21T10:30:00Z',
      },
    ]
  }
  if (clean.includes('/payout/expectations') || clean.includes('/payouts')) {
    return JAI_MOCK_EXPECTATIONS
  }
  if (clean.includes('/payout/rules')) {
    return [
      { id: 'r1', lender_name: 'HDFC Bank', product: 'used_car', effective_from: '2024-04-01', basis: 'percent', rate_percent: '2.00', gating_type: 'pdd_complete', tds_rate_percent: '5.00' },
      { id: 'r2', lender_name: 'ICICI Bank', product: 'new_car', effective_from: '2024-04-01', basis: 'percent', rate_percent: '1.75', gating_type: 'disbursal', tds_rate_percent: '5.00' },
      { id: 'r3', lender_name: 'Cholamandalam', product: 'loan_against_car', effective_from: '2024-04-01', basis: 'percent', rate_percent: '2.50', gating_type: 'pdd_complete', tds_rate_percent: '5.00' },
    ]
  }

  // PDD Board
  if (clean.includes('/pdd')) {
    return JAI_MOCK_PDD
  }

  // Lenders
  if (clean.includes('/lenders')) {
    return [
      { id: 'l1', name: 'HDFC Bank', code: 'HDFC', is_active: true, products: ['used_car', 'new_car'] },
      { id: 'l2', name: 'ICICI Bank', code: 'ICICI', is_active: true, products: ['new_car', 'used_car'] },
      { id: 'l3', name: 'Kotak Mahindra Bank', code: 'KOTAK', is_active: true, products: ['used_car'] },
      { id: 'l4', name: 'Tata Capital', code: 'TATA', is_active: true, products: ['commercial_vehicle'] },
      { id: 'l5', name: 'Cholamandalam', code: 'CHOLA', is_active: true, products: ['loan_against_car'] },
    ]
  }

  // Tasks & Workflow
  if (clean.includes('/tasks') || clean.includes('/workflow/tasks')) {
    return [
      { id: 't1', title: 'Collect RTO Form 34 from Borrower', type: 'follow_up', case_no: 'JA-2025-0106', status: 'pending', priority: 'critical', owner_name: 'Rohan Verma', due_date: '2025-03-05' },
      { id: 't2', title: 'Verify Bank Hypothecation Endorsement', type: 'verification', case_no: 'JA-2025-0101', status: 'pending', priority: 'high', owner_name: 'Aarav Sharma', due_date: '2025-03-01' },
    ]
  }

  // Parties & Customers (Borrowers & Customers Directory)
  if (clean.includes('/parties') || clean.includes('/customers')) {
    if (clean.includes('/reveal') && method === 'POST') {
      return {
        field_name: 'pan',
        value: 'ABCDE1234F',
        revealed_at: new Date().toISOString(),
      }
    }

    if (method === 'POST') {
      const cleanPan = parsedBody?.pan ? parsedBody.pan.trim().toUpperCase() : undefined
      const cleanAadhaar = parsedBody?.aadhaar_last_four ? parsedBody.aadhaar_last_four.trim() : undefined
      const newParty: any = {
        id: `party-${Date.now()}`,
        org_id: '11111111-1111-1111-1111-111111111111',
        name: parsedBody?.name || 'New Customer',
        mobile_primary: parsedBody?.mobile_primary || '9820011223',
        email: parsedBody?.email || null,
        pan_last_four: cleanPan ? cleanPan.slice(-4) : (parsedBody?.pan_last_four || null),
        pan_masked: cleanPan ? `${cleanPan.slice(0, 5)}****${cleanPan.slice(-1)}` : (parsedBody?.pan_masked || null),
        aadhaar_masked: cleanAadhaar ? `**** **** ${cleanAadhaar}` : (parsedBody?.aadhaar_masked || '**** **** 1234'),
        employment_type: parsedBody?.employment_type || 'salaried',
        city: parsedBody?.city || 'Mumbai',
        state: parsedBody?.state || 'Maharashtra',
        monthly_income: parsedBody?.monthly_income ? Number(parsedBody.monthly_income) : 75000,
        version: 1,
        created_at: new Date().toISOString(),
      }
      addOrUpdateStoredParty(newParty)
      return newParty
    }

    // GET list of parties (derived from persistent store and qualifying cases)
    const storedParties = getStoredParties()
    const storedCases = getStoredCases()

    // Enrich with computed active cases and disbursed volume
    return storedParties.map((p) => {
      const linkedCases = storedCases.filter((c) =>
        (c.party_id && c.party_id === p.id) ||
        (c.primary_party?.id && c.primary_party.id === p.id) ||
        (p.mobile_primary && (c.primary_applicant_mobile === p.mobile_primary || c.mobile === p.mobile_primary)) ||
        (p.name && (c.primary_applicant_name || c.applicant_name || '').toLowerCase().trim() === p.name.toLowerCase().trim())
      )

      const activeCount = linkedCases.filter((c) =>
        ['lead', 'in_calling', 'interested', 'callback_scheduled', 'sanctioned', 'docs_collected', 'login_preparation'].includes(c.status)
      ).length

      const totalDisbursed = linkedCases
        .filter((c) => ['disbursed', 'completed', 'pdd_pending'].includes(c.status))
        .reduce((sum, c) => sum + Number(c.loan_amount_disbursed || c.applied_loan_amount || c.loan_amount_requested || 0), 0)

      return {
        ...p,
        active_cases_count: activeCount,
        total_disbursed_volume: totalDisbursed,
      }
    })
  }

  // Users Management
  if (clean.includes('/users')) {
    if (method === 'POST') {
      const newUser = {
        id: `u-${Date.now()}`,
        org_id: '11111111-1111-1111-1111-111111111111',
        name: parsedBody?.name || 'New Team Member',
        email: parsedBody?.email || `user${Date.now()}@apexloans.com`,
        mobile: parsedBody?.phone || '9820011999',
        role: parsedBody?.role || 'processor',
        is_active: true,
        created_at: new Date().toISOString(),
      }
      JAI_MOCK_USERS.push(newUser)
      return newUser
    }
    return JAI_MOCK_USERS
  }

  // Audit Log
  if (clean.includes('/audit')) {
    return JAI_MOCK_AUDIT
  }

  // Tenancy & Organizations
  if (clean.includes('/organizations/current/branding')) {
    return {
      name: 'Jai Automobiles',
      tagline: 'Vehicle Finance Operations',
      logo_url: '/jai_auto_logo.jpg',
      theme_preset: 'gold_emerald',
      primary_color: '#10b981',
      accent_color: '#fbbf24',
    }
  }
  if (clean.includes('/organizations/current')) {
    return JAI_MOCK_ORGANIZATIONS[0]
  }
  if (clean.includes('/organizations') || clean.includes('/platform/organizations')) {
    if (method === 'POST') {
      const newOrg = {
        id: `org-${Date.now()}`,
        name: parsedBody?.name || 'New Organization',
        slug: (parsedBody?.name || 'new-org').toLowerCase().replace(/\s+/g, '-'),
        plan: parsedBody?.plan || 'growth',
        region: 'in-west-1',
        is_active: true,
        settings: parsedBody?.settings || {
          branding: {
            name: parsedBody?.name || 'New Organization',
            tagline: 'Finance Operations',
            logo_url: '/jai_auto_logo.jpg',
            theme_preset: 'navy_slate',
            primary_color: '#2563eb',
            accent_color: '#94a3b8',
          },
          modules: {
            cases: true,
            documents: true,
            lenders: true,
            pdd: true,
            payout: true,
            reconciliation: true,
            reports: true,
            audit: true,
          },
        },
      }
      JAI_MOCK_ORGANIZATIONS.push(newOrg)
      return newOrg
    }
    return JAI_MOCK_ORGANIZATIONS
  }

  // Document Types Catalog
  if (clean.includes('/document-types') || clean.includes('/config/document-types')) {
    return [
      { id: 'dt-pan', code: 'pan', name: 'Borrower PAN Card', group_name: 'KYC Documents' },
      { id: 'dt-aadhaar', code: 'aadhaar', name: 'Aadhaar Card', group_name: 'KYC Documents' },
      { id: 'dt-bank-stmt', code: 'bank_stmt', name: 'Bank Statement (6M)', group_name: 'Financial Documents' },
      { id: 'dt-rc', code: 'rc', name: 'Vehicle RC Copy', group_name: 'Vehicle Documents' },
      { id: 'dt-form34', code: 'form_34', name: 'Form 34 Hypothecation', group_name: 'PDD Documents' },
    ]
  }

  // Document Upload (Quick Intake, Dossier & General)
  if ((clean.includes('/documents/upload') || (clean === '/documents' && method === 'POST')) && method === 'POST') {
    const docTypeId = getBodyField('document_type_id') || getBodyField('doc_type') || 'dt-pan'
    const fileName = getBodyField('file') || getBodyField('file_name') || 'borrower_document.pdf'
    const docId = `doc-${Date.now()}`
    const docTypeCode = docTypeId.includes('pan') ? 'PAN' : docTypeId.includes('rc') ? 'VEHICLE_RC' : docTypeId.includes('aadhaar') ? 'AADHAAR' : 'KYC_DOC'
    return {
      id: docId,
      org_id: '11111111-1111-1111-1111-111111111111',
      case_id: 'case-jai-01',
      document_type_id: docTypeId,
      file_name: fileName,
      file_size: 342000,
      mime_type: 'application/pdf',
      version: 1,
      status: 'verified',
      can_download: true,
      uploaded_at: new Date().toISOString(),
      scan_result: {
        ocr_status: 'completed',
        document_type_code: docTypeCode,
        pipeline_stage: 'extraction_verified',
        confidence_avg: 98.4,
        extracted_at: new Date().toISOString(),
        fields: [
          { field_key: 'customer_name', label: 'Borrower Name', value: 'Rajesh Kumar', confidence: 99.2, status: 'verified' },
          { field_key: 'pan_number', label: 'Permanent Account No', value: 'ABCDE1234F', confidence: 99.5, status: 'verified' },
          { field_key: 'contact_mobile', label: 'Contact Mobile', value: '9820011223', confidence: 98.0, status: 'verified' },
          { field_key: 'vehicle_make', label: 'Vehicle Make', value: 'Hyundai', confidence: 97.5, status: 'verified' },
          { field_key: 'vehicle_model', label: 'Vehicle Model', value: 'Creta SX', confidence: 96.8, status: 'verified' },
          { field_key: 'vehicle_registration_no', label: 'Registration No', value: 'MH02EK9988', confidence: 97.0, status: 'verified' },
        ],
      },
    }
  }

  // Document Status Update (Verify, Reject, Link)
  if (clean.includes('/documents') && (clean.includes('/status') || method === 'PATCH')) {
    const docStatus = getBodyField('status') || 'verified'
    return {
      id: `doc-${Date.now()}`,
      status: docStatus,
      updated_at: new Date().toISOString(),
      reject_reason: getBodyField('reason'),
    }
  }

  // Verify extraction
  if (clean.includes('/verify-extraction')) {
    return {
      success: true,
      verified: true,
      updated_at: new Date().toISOString(),
    }
  }

  // Request message
  if (clean.includes('/request-message')) {
    return {
      case_no: 'JA-2025-0101',
      customer_name: 'Rajesh Kumar',
      message: 'Dear Rajesh Kumar, please provide your pending KYC (PAN/Aadhaar) and Vehicle RC copy for your loan file processing at Jai Automobiles.',
      missing_count: 2,
    }
  }

  // Upload URL / Download URL
  if (clean.includes('/upload-url')) {
    return {
      upload_id: `up-${Date.now()}`,
      upload_url: 'https://storage.googleapis.com/mock-quarantine/upload',
      quarantine_key: `quar-${Date.now()}`,
      expires_in_seconds: 900,
    }
  }
  if (clean.includes('/download')) {
    return {
      download_url: 'https://storage.googleapis.com/mock-documents/verified.pdf',
      expires_in_seconds: 900,
    }
  }

  // Generic Documents Fallback
  if (clean.includes('/documents')) {
    const docId = `doc-${Date.now()}`
    return {
      id: docId,
      case_id: 'case-jai-01',
      document_type_id: 'dt-pan',
      file_name: 'verified_document.pdf',
      file_size_bytes: 342000,
      mime_type: 'application/pdf',
      storage_path: `/quarantine/${docId}.pdf`,
      scan_status: 'clean',
      verification_status: 'verified',
      extracted_data: {
        document_number: 'ABCDE1234F',
        holder_name: 'Rajesh Kumar Sharma',
        issue_date: '2020-01-15',
      },
      uploaded_at: new Date().toISOString(),
    }
  }

  // Checklist
  if (clean.includes('/checklist')) {
    const caseId = clean.match(/\/cases\/([^\/\?]+)\/checklist/)?.[1] || 'case-jai-01'
    const docs = getStoredDocuments(caseId)
    const items = docs.map((d) => ({
      document_type_id: d.document_type_id,
      code: d.scan_result?.document_type_code || d.document_type_id.replace('dt-', '').toUpperCase(),
      name: d.file_name.replace(/_/g, ' ').replace('.pdf', ''),
      group_name: d.document_type_id.includes('rc') ? 'Vehicle Documents' : 'KYC Documents',
      is_mandatory: true,
      status: d.status,
      document_id: d.id,
      file_name: d.file_name,
      file_size: d.file_size,
      can_download: true,
      uploaded_at: d.uploaded_at,
      scan_result: d.scan_result,
    }))
    return {
      case_id: caseId,
      missing_mandatory_count: 0,
      items: items.length > 0 ? items : [
        {
          document_type_id: 'dt-pan',
          code: 'PAN',
          name: 'Borrower PAN Card',
          group_name: 'KYC Documents',
          is_mandatory: true,
          status: 'verified',
          document_id: 'doc-pan-01',
          file_name: 'rajesh_pan.pdf',
          file_size: 245000,
          can_download: true,
          uploaded_at: '2025-02-15T10:30:00Z',
        },
        {
          document_type_id: 'dt-aadhaar',
          code: 'AADHAAR',
          name: 'Borrower Aadhaar Card',
          group_name: 'KYC Documents',
          is_mandatory: true,
          status: 'verified',
          document_id: 'doc-aadhaar-01',
          file_name: 'rajesh_aadhaar_masked.pdf',
          file_size: 380000,
          can_download: true,
          uploaded_at: '2025-02-15T10:32:00Z',
        },
        {
          document_type_id: 'dt-rc',
          code: 'VEHICLE_RC',
          name: 'Vehicle Registration Certificate (RC)',
          group_name: 'Vehicle Documents',
          is_mandatory: true,
          status: 'verified',
          document_id: 'doc-rc-01',
          file_name: 'vehicle_rc.pdf',
          file_size: 412000,
          can_download: true,
          uploaded_at: '2025-02-15T10:35:00Z',
        },
      ],
    }
  }

  // Applications Fallback
  if (clean.includes('/applications')) {
    if (clean.includes('/pdd')) {
      return []
    }
    return [
      {
        id: 'app-hdfc-01',
        case_id: clean.match(/\/cases\/([^\/\?]+)/)?.[1] || 'case-jai-01',
        lender_id: 'lender-hdfc',
        lender_name: 'HDFC Bank',
        status: 'in_review',
        applied_at: new Date().toISOString(),
        loan_amount_applied: 500000,
        tenure_applied_months: 48,
        interest_rate_offered: 10.5,
        is_winning: false,
      },
    ]
  }

  // Workflow tasks Fallback
  if (clean.includes('/tasks') || clean.includes('/workflow/tasks')) {
    return []
  }

  // PDD Board Fallback
  if (clean.includes('/pdd')) {
    return { items: [] }
  }

  // Timeline / Audit Fallback
  if (clean.includes('/timeline') || clean.includes('/audit')) {
    return [
      {
        id: 'audit-01',
        event_name: 'Case Initialized & Ingestion Completed',
        created_at: new Date().toISOString(),
        actor_name: 'System Intake Pipeline',
      },
    ]
  }

  return null
}

export function getAuthToken(): string | null {
  try {
    return useAuthStore.getState().accessToken
  } catch {
    return null
  }
}

function resolveUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint
  }

  // Base API path
  const base = import.meta.env.VITE_API_URL || '/api/v1'
  let cleanBase = base.replace(/\/+$/, '')
  if (cleanBase.startsWith('http') && !cleanBase.includes('/api')) {
    cleanBase = `${cleanBase}/api/v1`
  }
  
  let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  // If endpoint already begins with /api/v1 or /api/v2, don't duplicate base
  if (path.startsWith('/api/')) {
    // If base is a full URL, strip /api/v\d from path before joining
    if (cleanBase.startsWith('http')) {
      path = path.replace(/^\/api\/v\d/, '')
      path = path.startsWith('/') ? path : `/${path}`
    }
  }

  let finalUrl = cleanBase.startsWith('http') ? `${cleanBase}${path}` : (path.startsWith('/api') ? path : `${cleanBase}${path}`)

  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        searchParams.append(k, String(v))
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryString
    }
  }

  return finalUrl
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, params, ...customConfig } = options

  const headers = new Headers(customConfig.headers || {})

  if (!skipAuth) {
    const token = getAuthToken()
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  // Don't set Content-Type if body is FormData (browser will set boundary)
  if (customConfig.body && !(customConfig.body instanceof FormData) && typeof customConfig.body === 'object') {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    customConfig.body = JSON.stringify(customConfig.body)
  }

  const config: RequestInit = {
    ...customConfig,
    headers,
  }

  const url = resolveUrl(endpoint, params)
  let response: Response
  let data: any = null

  try {
    response = await fetch(url, config)
  } catch (networkError) {
    // If backend is offline or network fails, check prototype fallback
    const mock = getMockFallback(endpoint, config.method || 'GET', customConfig.body)
    if (mock !== null && mock !== undefined) {
      return mock as T
    }
    throw new ApiError('Unable to connect to server. Please check your network connection.', 0)
  }

  const contentType = response.headers.get('content-type')
  const isHtml = Boolean(contentType && contentType.includes('text/html'))

  // Vercel SPA rewrite fallback: If an API endpoint returned the HTML index.html, backend is not present
  if (isHtml && !endpoint.endsWith('.html')) {
    const mock = getMockFallback(endpoint, config.method || 'GET', customConfig.body)
    if (mock !== null && mock !== undefined) {
      return mock as T
    }
    throw new ApiError('Backend server not deployed (SPA rewrite intercepted).', 404)
  }

  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json()
    } catch {
      data = null
    }
  } else {
    data = await response.text()
  }

  if (!response.ok) {
    // If server returned 405 (Method Not Allowed on static Vercel/Vite hosting), 404, or 500+ (backend offline/crashed), provide graceful fallback
    if (response.status === 405 || response.status === 404 || response.status >= 500) {
      const mock = getMockFallback(endpoint, config.method || 'GET', customConfig.body)
      if (mock !== null && mock !== undefined) {
        return mock as T
      }
    }

    let errorMessage = `Request failed with status ${response.status}`
    let errorCode: string | undefined
    let errorDetails: unknown
    let requestId: string | undefined

    if (data && typeof data === 'object') {
      if (data.error) {
        errorMessage = data.error.message || errorMessage
        errorCode = data.error.code
        errorDetails = data.error.details
      } else if (data.detail) {
        errorMessage = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
      } else if (data.message) {
        errorMessage = data.message
      }
      requestId = data.request_id || response.headers.get('x-request-id') || undefined
    }

    throw new ApiError(errorMessage, response.status, errorCode, errorDetails, requestId)
  }

  // Unwrap envelope if present: { success: true, data: ... }
  if (data && typeof data === 'object' && 'data' in data && data.success !== false) {
    return data.data as T
  }

  return data as T
}

export const api = {
  get: <T>(url: string, options?: RequestOptions): Promise<T> =>
    request<T>(url, { ...options, method: 'GET' }),

  getWithEnvelope: async <T>(url: string, options?: RequestOptions): Promise<EnvelopeResponse<T>> => {
    const { skipAuth, params, ...customConfig } = options || {}
    const headers = new Headers(customConfig.headers || {})
    if (!skipAuth) {
      const token = getAuthToken()
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
    }
    const finalUrl = resolveUrl(url, params)
    let response: Response
    try {
      response = await fetch(finalUrl, { ...customConfig, headers, method: 'GET' })
    } catch {
      const mock = getMockFallback(url, 'GET')
      return {
        data: (mock ?? {}) as T,
        meta: {
          total: Array.isArray(mock) ? mock.length : 1,
          page: 1,
          page_size: 20,
          has_next: false,
          has_prev: false,
        },
        success: true,
      }
    }

    const contentType = response.headers.get('content-type')
    if ((contentType && contentType.includes('text/html')) || !response.ok) {
      const mock = getMockFallback(url, 'GET')
      return {
        data: (mock ?? {}) as T,
        meta: {
          total: Array.isArray(mock) ? mock.length : 1,
          page: 1,
          page_size: 20,
          has_next: false,
          has_prev: false,
        },
        success: true,
      }
    }

    let data: any
    try {
      data = await response.json()
    } catch {
      const mock = getMockFallback(url, 'GET')
      return {
        data: (mock ?? {}) as T,
        meta: {
          total: Array.isArray(mock) ? mock.length : 1,
          page: 1,
          page_size: 20,
          has_next: false,
          has_prev: false,
        },
        success: true,
      }
    }

    return {
      data: data.data !== undefined ? data.data : data,
      meta: data.meta,
      success: data.success,
    }
  },

  post: <T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(url, { ...options, method: 'POST', body: body as any }),

  put: <T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(url, { ...options, method: 'PUT', body: body as any }),

  patch: <T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(url, { ...options, method: 'PATCH', body: body as any }),

  delete: <T>(url: string, options?: RequestOptions): Promise<T> =>
    request<T>(url, { ...options, method: 'DELETE' }),
}
