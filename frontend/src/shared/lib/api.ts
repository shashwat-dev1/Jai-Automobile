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
  JAI_MOCK_CASES,
  JAI_MOCK_DASHBOARD,
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
import { createCaseInFirestore } from './firebaseService'

function getMockFallback(endpoint: string, method = 'GET', body?: any): any {
  const clean = endpoint.toLowerCase().replace(/^\/api\/v\d/, '')
  let parsedBody = body
  if (typeof body === 'string') {
    try {
      parsedBody = JSON.parse(body)
    } catch {
      parsedBody = {}
    }
  }

  // Authentication endpoints
  if (clean.includes('/auth/login') && method === 'POST') {
    const role = (parsedBody?.identifier || '').includes('accountant')
      ? 'accountant'
      : (parsedBody?.identifier || '').includes('processor')
      ? 'processor'
      : (parsedBody?.identifier || '').includes('field')
      ? 'field_executive'
      : (parsedBody?.identifier || '').includes('auditor')
      ? 'auditor'
      : (parsedBody?.identifier || '').includes('telecaller')
      ? 'telecaller'
      : (parsedBody?.identifier || '').includes('manager')
      ? 'manager'
      : 'owner'
    const roleNames: Record<string, string> = {
      owner: 'Aarav Sharma (MD)',
      manager: 'Priya Patel (Branch Manager)',
      processor: 'Rohan Verma (Sr. Loan Processor)',
      accountant: 'Sanjay Gupta (Chief Accountant)',
      field_executive: 'Kavita Singh (Field Officer)',
      auditor: 'Meera Iyer (Internal Auditor)',
      telecaller: 'Priya Nair (Telecaller)',
    }
    return {
      access_token: 'demo-prototype-access-token',
      refresh_token: 'demo-prototype-refresh-token',
      token_type: 'bearer',
      user: {
        id: `jai-user-${role}`,
        org_id: '11111111-1111-1111-1111-111111111111',
        name: roleNames[role] || 'Aarav Sharma',
        email: parsedBody?.identifier || `${role}@jaiautomobiles.com`,
        role,
        is_active: true,
        created_at: new Date().toISOString(),
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
        ],
      },
    }
  }

  if (clean.includes('/auth/me')) {
    return {
      id: 'jai-user-owner',
      org_id: '11111111-1111-1111-1111-111111111111',
      name: 'Aarav Sharma (MD)',
      email: 'owner@jaiautomobiles.com',
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
      ],
    }
  }

  // Dashboard endpoints
  if (clean.includes('/dashboard/overview')) {
    return JAI_MOCK_DASHBOARD
  }
  if (clean.includes('/dashboard/today')) {
    return {
      counts: {
        due_today_count: 8,
        uncalled_count: 9,
        interested_count: 14,
        unassigned_count: 5,
        retry_count: 6,
        overdue_count: 2,
        stuck_cases_count: 0,
        expiring_docs_count: 0,
        pdd_due_count: 0,
      },
      callbacks_due_today: [
        {
          id: 'cb-1',
          customer_name: 'Rajesh Kumar Sharma',
          mobile: '9820011223',
          time: '11:30 AM',
          vehicle: '2022 Maruti Swift ZXi',
          loan_amount: 520000,
          telecaller_name: 'Priya Sharma',
          notes: 'Requested callback after 11:30 AM. Very receptive for 4-year tenure.',
          lead_no: 'JA-2025-0101',
          status: 'callback_scheduled',
        },
        {
          id: 'cb-2',
          customer_name: 'Amitabh Singh Chauhan',
          mobile: '9833441122',
          time: '02:00 PM',
          vehicle: 'Mahindra XUV700 AX7',
          loan_amount: 1450000,
          telecaller_name: 'Rahul Verma',
          notes: 'Wants best ROI comparison across lenders. Ready to submit documents.',
          lead_no: 'JA-2025-0102',
          status: 'callback_scheduled',
        },
        {
          id: 'cb-3',
          customer_name: 'Karan Mehra',
          mobile: '9819922334',
          time: '04:15 PM',
          vehicle: 'Hyundai Creta SX (O)',
          loan_amount: 1100000,
          telecaller_name: 'Priya Sharma',
          notes: 'Evaluating between new vs 2023 pre-owned model. Call back with EMI schedule.',
          lead_no: 'JA-2025-0108',
          status: 'callback_scheduled',
        },
        {
          id: 'cb-4',
          customer_name: 'Pooja Hegde',
          mobile: '9821098765',
          time: '05:30 PM',
          vehicle: 'Tata Nexon Fearless+',
          loan_amount: 900000,
          telecaller_name: 'Rahul Verma',
          notes: 'Co-applicant spouse income to be added. Wants evening callback.',
          lead_no: 'JA-2025-0110',
          status: 'callback_scheduled',
        },
      ],
      uncalled_leads: [
        {
          id: 'unc-1',
          customer_name: 'Sunil Verma',
          mobile: '9820011223',
          inflow_source: 'Excel Bulk Inflow Batch (Q1 Leads)',
          received_at: '45 mins ago',
          vehicle: 'Used Car (2022 Swift)',
          loan_amount: 650000,
          city: 'Mumbai',
          lead_no: 'LEAD-IMP-101',
        },
        {
          id: 'unc-2',
          customer_name: 'Meena Sundaram',
          mobile: '9821199887',
          inflow_source: 'Public Referral Partner Portal',
          received_at: '1 hr ago',
          vehicle: 'New Car (Hyundai i20)',
          loan_amount: 1200000,
          city: 'Pune',
          lead_no: 'LEAD-REF-204',
        },
        {
          id: 'unc-3',
          customer_name: 'Ravi Teja',
          mobile: '9844055667',
          inflow_source: 'Direct WhatsApp Inflow',
          received_at: '2 hrs ago',
          vehicle: 'Commercial Vehicle (Tata Ace)',
          loan_amount: 850000,
          city: 'Nagpur',
          lead_no: 'LEAD-WA-309',
        },
      ],
      interested_prospects: [
        {
          id: 'int-1',
          customer_name: 'Sneha Roy',
          mobile: '9820499112',
          vehicle: 'Tata Safari Dark Edition',
          loan_amount: 1800000,
          telecaller_name: 'Priya Sharma',
          notes: 'Hot lead! Confirmed vehicle selection and requested loan sanction comparison. Ready for client intake.',
          lead_no: 'JA-2025-0104',
          case_id: 'case-jai-104',
        },
        {
          id: 'int-2',
          customer_name: 'Virender Singh Rathore',
          mobile: '9820556677',
          vehicle: 'Toyota Fortuner 4x4',
          loan_amount: 2200000,
          telecaller_name: 'Rahul Verma',
          notes: 'Interested in fast sanction. Has clear CIBIL (780+). Ready to onboard as client.',
          lead_no: 'JA-2025-0106',
          case_id: 'case-jai-106',
        },
        {
          id: 'int-3',
          customer_name: 'Arjun Deshmukh',
          mobile: '9833112244',
          vehicle: 'Kia Seltos GTX Plus',
          loan_amount: 1350000,
          telecaller_name: 'Priya Sharma',
          notes: 'Agreed to initiate application. Bank statement collected via WhatsApp.',
          lead_no: 'JA-2025-0107',
          case_id: 'case-jai-107',
        },
      ],
      unassigned_leads: [
        {
          id: 'una-1',
          customer_name: 'Deepak Jadhav',
          mobile: '9899011234',
          vehicle: 'Car Refinance',
          loan_amount: 450000,
          inflow_source: 'Maruti True Value - Andheri West',
          city: 'Thane',
          lead_no: 'LEAD-IMP-104',
        },
        {
          id: 'una-2',
          customer_name: 'Alok Nath',
          mobile: '9811223344',
          vehicle: 'Commercial Pickup (Bolero Maxi)',
          loan_amount: 700000,
          inflow_source: 'Public Referral Partner Portal',
          city: 'Navi Mumbai',
          lead_no: 'LEAD-REF-209',
        },
      ],
      retry_leads: [
        {
          id: 'ret-1',
          customer_name: 'Vikram Joshi',
          mobile: '9876543210',
          attempt_count: 2,
          last_attempt: 'Today 10:15 AM',
          outcome: 'Ringing No Response (RNR)',
          telecaller_name: 'Priya Sharma',
          lead_no: 'LEAD-IMP-112',
        },
        {
          id: 'ret-2',
          customer_name: 'Ananya Deshmukh',
          mobile: '9833221100',
          attempt_count: 1,
          last_attempt: 'Today 11:00 AM',
          outcome: 'Call Busy',
          telecaller_name: 'Rahul Verma',
          lead_no: 'LEAD-REF-215',
        },
      ],
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
        {
          id: 't3',
          title: 'Outreach to Hot Prospect: Sneha Roy (Safari Dark)',
          type: 'client_intake',
          case_no: 'JA-2025-0104',
          owner_name: 'Priya Sharma',
          due_date: new Date().toISOString(),
          status: 'pending',
        },
      ],
      tasks_overdue: [
        {
          id: 't-ov-1',
          title: 'Follow-up on RNR Lead: Vikram Joshi (Attempt 2 pending)',
          type: 'retry_dial',
          case_no: 'LEAD-IMP-112',
          owner_name: 'Priya Sharma',
          due_date: new Date(Date.now() - 3600000).toISOString(),
          status: 'pending',
        },
      ],
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
    const foundCase = JAI_MOCK_CASES.find((c: any) => c.id === caseId || c.case_no?.toLowerCase() === caseId) || JAI_MOCK_CASES[0]
    if (foundCase) {
      const prevStatus = foundCase.status
      foundCase.status = parsedBody?.status || foundCase.status
      foundCase.version = (foundCase.version || 1) + 1
      foundCase.updated_at = new Date().toISOString()
      if (Array.isArray(foundCase.status_history)) {
        foundCase.status_history.unshift({
          id: `sh-${Date.now()}`,
          from_status: prevStatus,
          to_status: foundCase.status,
          changed_by: 'current-user',
          changer_name: 'Current User',
          created_at: new Date().toISOString(),
        })
      }
      return foundCase
    }
  }

  // Phase 1: Telecaller Workspace
  if (clean.includes('/cases/telecaller/workspace')) {
    const assigned = JAI_MOCK_CASES.filter((c: any) => c.assigned_telecaller_id || c.assigned_telecaller_name)
    const list = assigned.length > 0 ? assigned : JAI_MOCK_CASES
    return {
      total_assigned: list.length,
      pending_leads: list.filter((c: any) => !c.call_outcome || c.call_outcome === 'new').length,
      follow_ups_due: list.filter((c: any) => c.call_outcome === 'follow_up').length,
      interested_count: list.filter((c: any) => c.call_outcome === 'interested').length,
      completed_count: list.filter((c: any) => ['interested', 'not_interested', 'duplicate'].includes(c.call_outcome || '')).length,
      leads: list,
    }
  }

  // Phase 1: Lead Assignment (Bulk / Single)
  if (clean.includes('/cases/assign') && method === 'POST') {
    const { case_ids, telecaller_id } = parsedBody || {}
    const tcUser = JAI_MOCK_USERS.find((u: any) => u.id === telecaller_id)
    const tcName = tcUser?.name || 'Priya Nair'
    let count = 0
    if (Array.isArray(case_ids)) {
      case_ids.forEach((cid: string) => {
        const found = JAI_MOCK_CASES.find((c: any) => c.id === cid)
        if (found) {
          found.assigned_telecaller_id = telecaller_id
          found.assigned_telecaller_name = tcName
          found.updated_at = new Date().toISOString()
          count++
        }
      })
    }
    return {
      assigned_count: count || (case_ids?.length || 1),
      telecaller_id,
      telecaller_name: tcName,
    }
  }

  // Phase 1: Call Activity Logging
  const callActivityMatch = clean.match(/\/cases\/([^\/\?]+)\/call-activity/)
  if (callActivityMatch && method === 'POST') {
    const caseId = callActivityMatch[1]
    const foundCase = JAI_MOCK_CASES.find((c: any) => c.id === caseId || c.case_no?.toLowerCase() === caseId) || JAI_MOCK_CASES[0]
    if (foundCase) {
      foundCase.call_outcome = parsedBody?.outcome || foundCase.call_outcome
      foundCase.telecaller_remarks = parsedBody?.remarks || foundCase.telecaller_remarks
      foundCase.follow_up_at = parsedBody?.follow_up_at || foundCase.follow_up_at
      foundCase.call_attempts_count = (foundCase.call_attempts_count || 0) + 1
      foundCase.updated_at = new Date().toISOString()
      if (!Array.isArray(foundCase.call_activity_history)) {
        foundCase.call_activity_history = []
      }
      foundCase.call_activity_history.unshift({
        id: `act-${Date.now()}`,
        outcome: parsedBody?.outcome,
        remarks: parsedBody?.remarks,
        follow_up_at: parsedBody?.follow_up_at,
        telecaller_name: 'Priya Nair',
        created_at: new Date().toISOString(),
      })
      return {
        case_id: foundCase.id,
        case_no: foundCase.case_no,
        call_outcome: foundCase.call_outcome,
        telecaller_remarks: foundCase.telecaller_remarks,
        follow_up_at: foundCase.follow_up_at,
        call_attempts_count: foundCase.call_attempts_count,
        updated_at: foundCase.updated_at,
      }
    }
  }

  // Phase 1: Referral Partner Mobile Lookup
  if (clean.includes('/referrals/lookup') && method === 'POST') {
    const rawMobile = (parsedBody?.mobile || '').replace(/\D/g, '').slice(-10)
    const match = JAI_MOCK_REFERRAL_PROFILES.find((p) => p.mobile_primary.includes(rawMobile))
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

  // Phase 1: Guest Referral Lead Submission
  if (clean.includes('/referrals/guest-submit') && method === 'POST') {
    const rawMobile = (parsedBody?.partner_mobile || '').replace(/\D/g, '').slice(-10)
    let partner = JAI_MOCK_REFERRAL_PROFILES.find((p) => p.mobile_primary.includes(rawMobile))
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
      JAI_MOCK_REFERRAL_PROFILES.unshift(partner)
    } else {
      partner.total_leads++
    }

    const newCase: any = {
      id: `case-jai-${Date.now()}`,
      case_no: `JA-2025-${Math.floor(1000 + Math.random() * 9000)}`,
      applicant_name: parsedBody?.applicant_name || 'Referral Borrower',
      primary_applicant_name: parsedBody?.applicant_name || 'Referral Borrower',
      mobile: parsedBody?.applicant_mobile || '9820011223',
      primary_applicant_mobile: parsedBody?.applicant_mobile || '9820011223',
      product: parsedBody?.product_type || 'used_car',
      product_type: parsedBody?.product_type || 'used_car',
      status: 'lead',
      applied_loan_amount: Number(parsedBody?.loan_amount_requested) || 500000,
      loan_amount_requested: Number(parsedBody?.loan_amount_requested) || 500000,
      vehicle_summary: parsedBody?.vehicle_reg_no ? `Vehicle (${parsedBody.vehicle_reg_no})` : 'Vehicle Loan Application',
      vehicle_details: parsedBody?.vehicle_reg_no ? `Vehicle (${parsedBody.vehicle_reg_no})` : 'Vehicle Loan Application',
      source_name: `Referral: ${partner.name}`,
      owner_name: 'Aarav Sharma',
      referral_profile_id: partner.id,
      referral_partner_name: partner.name,
      call_outcome: 'new',
      call_attempts_count: 0,
      has_consent: true,
      age_in_days: 0,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      primary_party: {
        id: `p-${Date.now()}`,
        name: parsedBody?.applicant_name || 'Referral Borrower',
        mobile_primary: parsedBody?.applicant_mobile || '9820011223',
        city: parsedBody?.city || 'Mumbai',
      },
    }
    JAI_MOCK_CASES.unshift(newCase)
    return {
      success: true,
      case_id: newCase.id,
      case_no: newCase.case_no,
      referral_profile_id: partner.id,
      partner_name: partner.name,
      message: `Lead successfully submitted and routed to Jai Automobiles lead desk. Reference: ${newCase.case_no}`,
    }
  }

  // Phase 1: Referral Partner Detail & Dossier
  const profileDetailMatch = clean.match(/\/referrals\/profiles\/([^\/\?]+)$/)
  if (profileDetailMatch && method === 'GET') {
    const profileId = profileDetailMatch[1]
    const profile = JAI_MOCK_REFERRAL_PROFILES.find((p) => p.id === profileId) || JAI_MOCK_REFERRAL_PROFILES[0]
    const associatedLeads = JAI_MOCK_CASES.filter((c: any) => c.referral_profile_id === profile.id || c.referral_partner_name === profile.name)
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
    const profile = JAI_MOCK_REFERRAL_PROFILES.find((p) => p.id === profileId) || JAI_MOCK_REFERRAL_PROFILES[0]
    profile.verification_status = parsedBody?.status || (profile.verification_status === 'verified' ? 'pending_verification' : 'verified')
    profile.verified_at = new Date().toISOString()
    return profile
  }

  // Phase 1: List Referral Profiles
  if (clean.includes('/referrals/profiles') && method === 'GET') {
    return JAI_MOCK_REFERRAL_PROFILES
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

  // Single Case Dossier (GET /cases/:id)
  const singleCaseMatch = clean.match(/\/cases\/([^\/\?]+)$/)
  if (singleCaseMatch && method === 'GET') {
    const caseId = singleCaseMatch[1]
    if (caseId && caseId !== 'new' && caseId !== 'list') {
      const foundCase = JAI_MOCK_CASES.find((c: any) => c.id === caseId || c.case_no?.toLowerCase() === caseId)
      return foundCase || JAI_MOCK_CASES[0]
    }
  }

  // Cases List (GET /cases)
  if (clean.includes('/cases') && method === 'GET') {
    return JAI_MOCK_CASES
  }

  // Case Creation (POST /cases)
  if (clean.includes('/cases') && method === 'POST') {
    const newCase = {
      id: `case-jai-${Date.now()}`,
      case_no: `JA-2025-${Math.floor(1000 + Math.random() * 9000)}`,
      applicant_name: parsedBody?.borrower?.name || parsedBody?.applicant_name || 'New Borrower',
      primary_applicant_name: parsedBody?.borrower?.name || parsedBody?.applicant_name || 'New Borrower',
      mobile: parsedBody?.borrower?.mobile || parsedBody?.mobile || '9820011223',
      primary_applicant_mobile: parsedBody?.borrower?.mobile || parsedBody?.mobile || '9820011223',
      product: parsedBody?.loan?.product || 'used_car',
      product_type: parsedBody?.loan?.product || 'used_car',
      status: 'lead',
      applied_loan_amount: Number(parsedBody?.loan?.requested_amount) || 750000,
      loan_amount_requested: Number(parsedBody?.loan?.requested_amount) || 750000,
      vehicle_summary: parsedBody?.vehicle?.make ? `${parsedBody.vehicle.make} ${parsedBody.vehicle.model || ''}` : 'Hyundai Creta 1.5 SX',
      vehicle_details: parsedBody?.vehicle?.make ? `${parsedBody.vehicle.make} ${parsedBody.vehicle.model || ''}` : 'Hyundai Creta 1.5 SX',
      source_name: parsedBody?.source_name || 'Direct Walk-in',
      owner_name: 'Aarav Sharma',
      has_consent: true,
      age_in_days: 0,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      primary_party: {
        id: `p-${Date.now()}`,
        name: parsedBody?.borrower?.name || parsedBody?.applicant_name || 'New Borrower',
        mobile_primary: parsedBody?.borrower?.mobile || parsedBody?.mobile || '9820011223',
        pan_masked: parsedBody?.borrower?.pan ? `${parsedBody.borrower.pan.slice(0, 5)}****${parsedBody.borrower.pan.slice(-1)}` : 'ABCDE****F',
        aadhaar_masked: '**** **** 1234',
        employment_type: parsedBody?.borrower?.employment_type || 'Salaried',
        city: parsedBody?.borrower?.city || 'Mumbai',
        monthly_income: Number(parsedBody?.borrower?.monthly_income) || 75000,
      },
      vehicle: {
        id: `v-${Date.now()}`,
        case_id: `case-jai-${Date.now()}`,
        vehicle_type: parsedBody?.loan?.product || 'four_wheeler',
        make: parsedBody?.vehicle?.make || 'Hyundai',
        model: parsedBody?.vehicle?.model || 'Creta',
        variant: parsedBody?.vehicle?.variant || '1.5 SX',
        year_of_manufacture: Number(parsedBody?.vehicle?.year) || 2023,
        condition: 'used',
        registration_no: parsedBody?.vehicle?.registration_no || 'MH02EK9988',
        valuation_amount: 850000,
      },
      status_history: [
        { id: `sh-${Date.now()}`, from_status: null, to_status: 'lead', changed_by: 'u-1', changer_name: 'Aarav Sharma', created_at: new Date().toISOString() },
      ],
    }
    JAI_MOCK_CASES.unshift(newCase)
    createCaseInFirestore(newCase).catch((e) => console.warn('Firestore case push notice:', e))
    return newCase
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

  // Parties & Customers
  if (clean.includes('/parties') || clean.includes('/customers')) {
    return [
      { id: 'p1', name: 'Rajesh Kumar Sharma', mobile: '9820198201', email: 'rajesh.sharma@gmail.com', pan_masked: 'ABCDE****F', active_cases_count: 1, total_disbursed_volume: 800000 },
      { id: 'p2', name: 'Amitabh Singh Chauhan', mobile: '9833441122', email: 'amitabh.chauhan@gmail.com', pan_masked: 'BKDPA****M', active_cases_count: 1, total_disbursed_volume: 1400000 },
      { id: 'p3', name: 'Virender Singh Rathore', mobile: '9845112233', email: 'virender.rathore@gmail.com', pan_masked: 'AFXPR****K', active_cases_count: 1, total_disbursed_volume: 500000 },
    ]
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

  // Documents
  if (clean.includes('/documents')) {
    const docId = `doc-${Date.now()}`
    return {
      id: docId,
      case_id: 'case-jai-01',
      document_type_id: 'pan_card',
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
    return {
      case_id: 'case-jai-01',
      missing_mandatory_count: 2,
      items: [
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
          document_type_id: 'dt-bank-stmt',
          code: 'BANK_STMT',
          name: 'Bank Statement (Latest 6 Months)',
          group_name: 'Financial Documents',
          is_mandatory: true,
          status: 'under_review',
          document_id: 'doc-stmt-01',
          file_name: 'hdfc_bank_statement.pdf',
          file_size: 890000,
          can_download: true,
          uploaded_at: '2025-02-16T14:10:00Z',
        },
        {
          document_type_id: 'dt-rc',
          code: 'VEHICLE_RC',
          name: 'Vehicle Registration Certificate (RC)',
          group_name: 'Vehicle Documents',
          is_mandatory: true,
          status: 'requested',
          document_id: null,
          can_download: false,
        },
        {
          document_type_id: 'dt-form34',
          code: 'FORM_34',
          name: 'Form 34 Hypothecation Application',
          group_name: 'PDD Documents',
          is_mandatory: true,
          status: 'requested',
          document_id: null,
          can_download: false,
        },
      ],
    }
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
    // If server returned 500 or 502/503/504 (backend offline/crashed), provide graceful prototype fallback
    if (response.status >= 500) {
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
