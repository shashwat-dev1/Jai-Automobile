/**
 * DSA OS — Store Synchronization & Offline-Resilient Persistence Layer
 * 
 * Ensures that leads created in Guest Referral (/referral), Quick Intake,
 * or Excel bulk import immediately sync into the Admin Panel (/cases, /referrals, /telecaller)
 * and survive page reloads and cross-tab navigation.
 */

import { JAI_MOCK_REFERRAL_PROFILES } from './mockDatabase'
import { createMockCases } from './mockCasesSeed'
import type { MockCase } from './mockDatabase'
import type { DocumentItem } from '../../features/documents/types'
import { isFirebaseConfigured, db } from './firebase'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

export const STORAGE_KEYS = {
  CASES: 'dsa_os_cases_store_v3',
  DOCUMENTS: 'dsa_os_documents_store_v2',
  REFERRAL_PROFILES: 'dsa_os_referrals_store_v2',
  COMMISSIONS: 'dsa_os_commissions_store_v2',
} as const

// --- Helper: Safe LocalStorage Access ---
function safeGetItem(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value)
    }
  } catch (err) {
    console.warn(`LocalStorage write error for ${key}:`, err)
  }
}

// --- 1. Cases Persistence & Cross-Tab Sync ---

export function getStoredCases(): MockCase[] {
  const raw = safeGetItem(STORAGE_KEYS.CASES)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length >= 20) {
        return parsed
      }
    } catch {
      // Fallback to initial seeds
    }
  }
  // Initialize storage with 38 multi-tier mock cases
  const initial = createMockCases()
  safeSetItem(STORAGE_KEYS.CASES, JSON.stringify(initial))
  return initial
}

export function saveStoredCases(cases: MockCase[]): void {
  safeSetItem(STORAGE_KEYS.CASES, JSON.stringify(cases))
  // Dispatch custom event for real-time reactive updates within current window
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsa_os_cases_updated', { detail: { count: cases.length } }))
  }
}

export function addStoredCase(newCase: MockCase): void {
  const current = getStoredCases()
  // Check duplicate ID
  const existingIdx = current.findIndex((c) => c.id === newCase.id || c.case_no === newCase.case_no)
  let updated: MockCase[]
  if (existingIdx >= 0) {
    updated = [...current]
    updated[existingIdx] = { ...updated[existingIdx], ...newCase }
  } else {
    updated = [newCase, ...current]
  }
  saveStoredCases(updated)

  // Asynchronously sync to Firebase Firestore if configured
  if (isFirebaseConfigured() && db) {
    try {
      const docRef = doc(db, 'cases', newCase.id)
      setDoc(docRef, {
        ...newCase,
        created_at: serverTimestamp(),
        organization_slug: 'jai-automobiles',
      }).catch((e) => console.warn('Background Firestore push notice:', e))
    } catch {
      // Silent non-blocking fail
    }
  }
}

export function updateStoredCase(caseId: string, updates: Partial<MockCase>): MockCase | null {
  const current = getStoredCases()
  const idx = current.findIndex((c) => c.id === caseId)
  if (idx < 0) return null

  const updatedCase = {
    ...current[idx],
    ...updates,
    updated_at: new Date().toISOString(),
    version: (current[idx].version || 1) + 1,
  }
  current[idx] = updatedCase
  saveStoredCases(current)
  return updatedCase
}

// --- 2. Referral Profiles Persistence ---

export function getStoredReferralProfiles(): any[] {
  const raw = safeGetItem(STORAGE_KEYS.REFERRAL_PROFILES)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    } catch {
      // Fallback
    }
  }
  const initial = [...JAI_MOCK_REFERRAL_PROFILES]
  safeSetItem(STORAGE_KEYS.REFERRAL_PROFILES, JSON.stringify(initial))
  return initial
}

export function saveStoredReferralProfiles(profiles: any[]): void {
  safeSetItem(STORAGE_KEYS.REFERRAL_PROFILES, JSON.stringify(profiles))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsa_os_referrals_updated'))
  }
}

export function addOrUpdateReferralProfile(partner: any): void {
  const current = getStoredReferralProfiles()
  const idx = current.findIndex((p) => p.id === partner.id || p.mobile_primary === partner.mobile_primary)
  let updated: any[]
  if (idx >= 0) {
    updated = [...current]
    updated[idx] = { ...updated[idx], ...partner }
  } else {
    updated = [partner, ...current]
  }
  saveStoredReferralProfiles(updated)
}

// --- 3. Documents & OCR Scans Persistence ---

export function getStoredDocuments(caseId: string): DocumentItem[] {
  const raw = safeGetItem(STORAGE_KEYS.DOCUMENTS)
  let allDocs: Record<string, DocumentItem[]> = {}
  if (raw) {
    try {
      allDocs = JSON.parse(raw)
    } catch {
      allDocs = {}
    }
  }

  if (allDocs[caseId] && allDocs[caseId].length > 0) {
    return allDocs[caseId]
  }

  // If no documents exist for this case, find the case and generate tailored deterministic OCR documents
  const cases = getStoredCases()
  const targetCase = cases.find((c) => c.id === caseId)
  if (targetCase) {
    const generated = generateDeterministicOcrDocs({
      id: targetCase.id,
      case_no: targetCase.case_no,
      applicant_name: targetCase.applicant_name || targetCase.primary_applicant_name || 'Borrower',
      mobile: targetCase.mobile || targetCase.primary_applicant_mobile || '9820011223',
      vehicle_make: targetCase.vehicle?.make || 'Hyundai',
      vehicle_model: targetCase.vehicle?.model || 'Creta',
      vehicle_reg_no: targetCase.vehicle?.registration_no || 'MH-02-CB-8821',
      vehicle_condition: targetCase.vehicle?.condition || (targetCase as any).vehicle_condition || (targetCase.product_type === 'new_car' ? 'new' : 'used'),
      city: targetCase.primary_party?.city || 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      loan_amount: targetCase.loan_amount_requested,
    })
    saveStoredDocuments(caseId, generated)
    return generated
  }

  return []
}

export function saveStoredDocuments(caseId: string, docs: DocumentItem[]): void {
  const raw = safeGetItem(STORAGE_KEYS.DOCUMENTS)
  let allDocs: Record<string, DocumentItem[]> = {}
  if (raw) {
    try {
      allDocs = JSON.parse(raw)
    } catch {
      allDocs = {}
    }
  }
  allDocs[caseId] = docs
  safeSetItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(allDocs))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsa_os_documents_updated', { detail: { caseId } }))
  }
}

export function addStoredDocument(caseId: string, docItem: DocumentItem): void {
  const existing = getStoredDocuments(caseId)
  const filtered = existing.filter((d) => d.id !== docItem.id && d.document_type_id !== docItem.document_type_id)
  const updated = [docItem, ...filtered]
  saveStoredDocuments(caseId, updated)
}

// --- 4. High-Accuracy Deterministic OCR Document Factory ---

export function generateDeterministicOcrDocs(params: {
  id: string
  case_no: string
  applicant_name: string
  mobile: string
  pan?: string
  vehicle_make?: string
  vehicle_model?: string
  vehicle_reg_no?: string
  vehicle_condition?: string
  city?: string
  state?: string
  pincode?: string
  loan_amount?: number
}): DocumentItem[] {
  const now = new Date().toISOString()
  const name = params.applicant_name.trim() || 'Ramesh Chandra Verma'
  const mobile = params.mobile.replace(/\D/g, '').slice(-10) || '9820011223'
  const isUsed = params.vehicle_condition !== 'new'
  const make = params.vehicle_make || 'Hyundai'
  const model = params.vehicle_model || 'Creta 1.5 SX'
  const regNo = params.vehicle_reg_no || (isUsed ? 'MH-02-CB-8821' : 'NEW-UNREGISTERED')
  const city = params.city || 'Mumbai'
  const state = params.state || 'Maharashtra'
  const pin = params.pincode || '400053'

  // Deterministic PAN based on name initials
  const panPrefix = (name.slice(0, 3).toUpperCase() + 'P').padEnd(4, 'A')
  const panSurnameInitial = name.split(' ').slice(-1)[0]?.charAt(0).toUpperCase() || 'S'
  const deterministicPan = params.pan || `${panPrefix}${panSurnameInitial}8821K`
  const lastFourDigits = mobile.slice(-4) || '8821'

  const docs: DocumentItem[] = []

  // 1. Borrower PAN Card Document
  docs.push({
    id: `doc-pan-${params.id}`,
    org_id: '11111111-1111-1111-1111-111111111111',
    case_id: params.id,
    document_type_id: 'dt-pan',
    file_name: `${name.replace(/\s+/g, '_')}_PAN_Card.pdf`,
    file_size: 284500,
    mime_type: 'application/pdf',
    version: 1,
    status: 'verified',
    can_download: true,
    uploaded_at: now,
    scan_result: {
      ocr_status: 'completed',
      document_type_code: 'PAN',
      pipeline_stage: 'extraction_verified',
      confidence_avg: 99.1,
      extracted_at: now,
      raw_text: `INCOME TAX DEPARTMENT\nGOVT. OF INDIA\nPermanent Account Number Card\n\nName: ${name.toUpperCase()}\nFather's Name: SURESH CHANDRA ${name.split(' ').slice(-1)[0]?.toUpperCase() || 'SHARMA'}\nDate of Birth: 14/08/1988\nPAN: ${deterministicPan}\nSignature Verified`,
      fields: [
        { field_key: 'customer_name', label: 'Full Name', value: name, confidence: 99.4, status: 'verified' },
        { field_key: 'pan_number', label: 'Income Tax PAN', value: deterministicPan, confidence: 99.8, status: 'verified' },
        { field_key: 'dob', label: 'Date of Birth', value: '1988-08-14', confidence: 98.2, status: 'verified' },
        { field_key: 'father_name', label: "Father's Name", value: `Suresh Chandra ${name.split(' ').slice(-1)[0] || 'Sharma'}`, confidence: 94.6, status: 'verified' },
        { field_key: 'pan_status', label: 'NSDL PAN Status', value: 'Active & Aadhaar Linked', confidence: 99.9, status: 'verified' },
      ],
    },
  })

  // 2. Borrower Aadhaar Card Document
  docs.push({
    id: `doc-aadhaar-${params.id}`,
    org_id: '11111111-1111-1111-1111-111111111111',
    case_id: params.id,
    document_type_id: 'dt-aadhaar',
    file_name: `${name.replace(/\s+/g, '_')}_Aadhaar_Masked.pdf`,
    file_size: 341200,
    mime_type: 'application/pdf',
    version: 1,
    status: 'verified',
    can_download: true,
    uploaded_at: now,
    scan_result: {
      ocr_status: 'completed',
      document_type_code: 'AADHAAR',
      pipeline_stage: 'extraction_verified',
      confidence_avg: 98.5,
      extracted_at: now,
      raw_text: `UNIQUE IDENTIFICATION AUTHORITY OF INDIA\n\nName: ${name}\nDOB: 14/08/1988\nGender: Male\nAddress: Flat 302, Sai Sagar Heights, Link Road, ${city}, ${state} - ${pin}\nXXXX XXXX ${lastFourDigits}\nVID: 9182 8172 6152 4132`,
      fields: [
        { field_key: 'customer_name', label: 'Full Name', value: name, confidence: 99.1, status: 'verified' },
        { field_key: 'aadhaar_masked', label: 'Aadhaar (Last 4)', value: `XXXX-XXXX-${lastFourDigits}`, confidence: 99.6, status: 'verified' },
        { field_key: 'dob', label: 'Date of Birth', value: '1988-08-14', confidence: 98.4, status: 'verified' },
        { field_key: 'gender', label: 'Gender', value: 'Male', confidence: 97.5, status: 'verified' },
        { field_key: 'address', label: 'Permanent Address', value: `Flat 302, Sai Sagar Heights, Link Road, ${city}, ${state} ${pin}`, confidence: 94.2, status: 'verified' },
        { field_key: 'mobile_registered', label: 'UIDAI Linked Mobile', value: `+91 ${mobile}`, confidence: 98.8, status: 'verified' },
      ],
    },
  })

  // 3. Vehicle RC (Mandatory for used, included if available)
  if (isUsed || params.vehicle_reg_no) {
    docs.push({
      id: `doc-rc-${params.id}`,
      org_id: '11111111-1111-1111-1111-111111111111',
      case_id: params.id,
      document_type_id: 'dt-rc',
      file_name: `${make}_${model.replace(/\s+/g, '_')}_RC_Copy.pdf`,
      file_size: 412000,
      mime_type: 'application/pdf',
      version: 1,
      status: 'verified',
      can_download: true,
      uploaded_at: now,
      scan_result: {
        ocr_status: 'completed',
        document_type_code: 'VEHICLE_RC',
        pipeline_stage: 'extraction_verified',
        confidence_avg: 98.2,
        extracted_at: now,
        raw_text: `FORM 23 — CERTIFICATE OF REGISTRATION\nTRANSPORT DEPARTMENT\n\nRegistration No: ${regNo}\nOwner Name: ${name}\nVehicle Class: LMV (Motor Car)\nMaker / Model: ${make} ${model}\nYear of Mfg: 2023\nFuel Type: Petrol\nHypothecation Status: Clear Title / Unencumbered\nChassis No: MALC1849104829103\nEngine No: G4FL3819402\nFitness Valid Upto: 24/03/2038`,
        fields: [
          { field_key: 'vehicle_registration_no', label: 'Registration Number', value: regNo, confidence: 99.5, status: 'verified' },
          { field_key: 'vehicle_make', label: 'Vehicle Make', value: make, confidence: 98.7, status: 'verified' },
          { field_key: 'vehicle_model', label: 'Vehicle Model', value: model, confidence: 98.1, status: 'verified' },
          { field_key: 'registered_owner', label: 'Registered Owner', value: name, confidence: 98.9, status: 'verified' },
          { field_key: 'mfg_year', label: 'Year of Manufacture', value: '2023', confidence: 97.4, status: 'verified' },
          { field_key: 'hypothecation', label: 'Hypothecation Status', value: 'Clear Title / Unencumbered', confidence: 93.8, status: 'verified' },
          { field_key: 'chassis_no', label: 'Chassis Number', value: 'MALC1849104829103', confidence: 99.0, status: 'verified' },
          { field_key: 'engine_no', label: 'Engine Number', value: 'G4FL3819402', confidence: 98.5, status: 'verified' },
        ],
      },
    })
  }

  return docs
}
