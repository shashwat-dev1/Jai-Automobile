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

  // Dashboard endpoints
  if (clean.includes('/dashboard/overview')) {
    return JAI_MOCK_DASHBOARD
  }
  if (clean.includes('/dashboard/today')) {
    return {
      counts: { due_today_count: 3, overdue_count: 1, stuck_cases_count: 2, expiring_docs_count: 1, pdd_due_count: 2 },
      tasks_due_today: [
        { id: 't1', title: 'Collect RTO Form 34 from Borrower', type: 'follow_up', case_no: 'JA-2025-0106', owner_name: 'Rohan Verma' },
        { id: 't2', title: 'Verify Bank Hypothecation Endorsement', type: 'verification', case_no: 'JA-2025-0101', owner_name: 'Aarav Sharma' },
      ],
      tasks_overdue: [
        { id: 't3', title: 'Submit Invoice Copy to HDFC Bank Operations', case_no: 'JA-2025-0101', owner_name: 'Rohan Verma' },
      ],
      stuck_cases: [
        { case_id: 'case-jai-103', case_no: 'JA-2025-0103', stage: 'under_lender_review', ageing_hours: 72, sla_hours: 48, owner_name: 'Rohan Verma' },
      ],
      expiring_documents: [
        { document_id: 'd1', document_name: 'Customer Insurance Cover Note', document_type_name: 'Vehicle Insurance', expires_at: new Date(Date.now() + 5 * 86400000).toISOString(), days_until_expiry: 5 },
      ],
      pdd_items_due: JAI_MOCK_PDD.items,
    }
  }

  // Sources Performance Report (must be checked BEFORE generic /sources)
  if (clean.includes('/sources/report')) {
    return JAI_MOCK_SOURCES_REPORT
  }
  if (clean.includes('/sources')) {
    return [
      { id: 's1', name: 'Maruti True Value - Andheri West', type: 'dealer', contact_person: 'Vikas Malhotra', contact_mobile: '9820098200', is_active: true },
      { id: 's2', name: 'Hyundai H-Promise - Thane', type: 'dealer', contact_person: 'Suresh Patil', contact_mobile: '9833098330', is_active: true },
      { id: 's3', name: 'Shree Sai Finance Connectors', type: 'connector', contact_person: 'Ramesh Shah', contact_mobile: '9819098190', is_active: true },
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
