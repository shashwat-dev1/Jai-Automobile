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
import {
  DEFAULT_FINANCING_PARTNERS,
  type FinancingPartnerMaster,
  type FinancingPartnerAllocation,
} from './leadQueues'
import type { PayoutPolicy, PayoutReceipt } from './payoutCalculator'
import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

export const STORAGE_KEYS = {
  CASES: 'dsa_os_cases_store_v3',
  DOCUMENTS: 'dsa_os_documents_store_v2',
  REFERRAL_PROFILES: 'dsa_os_referrals_store_v2',
  COMMISSIONS: 'dsa_os_commissions_store_v2',
  PARTIES: 'dsa_os_parties_store_v1',
  FINANCING_PARTNERS: 'dsa_os_financing_partners_v1',
  PARTNER_ALLOCATIONS: 'dsa_os_partner_allocations_v1',
  PAYOUT_POLICIES: 'dsa_os_payout_policies_v1',
  PAYOUT_RECEIPTS: 'dsa_os_payout_receipts_v1',
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

// --- Helper: Clean object for Firestore (eliminates undefined values) ---
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === undefined) return null as unknown as T
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return obj.toISOString() as unknown as T
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore) as unknown as T
  }
  const cleaned: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    cleaned[k] = v === undefined ? null : sanitizeForFirestore(v)
  }
  return cleaned as T
}

// --- 1. Cases Persistence & Cross-Device Cloud Sync ---

export function getStoredCases(): MockCase[] {
  const raw = safeGetItem(STORAGE_KEYS.CASES)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
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

/**
 * Asynchronously synchronizes a single case to Firebase Firestore.
 * Preserves multi-tenant isolation under organization_slug: 'jai-automobiles'.
 */
export async function syncCaseToCloud(caseItem: MockCase): Promise<void> {
  if (!isFirebaseConfigured() || !db) return
  const firestore = db
  try {
    const cleanCase = sanitizeForFirestore({
      ...caseItem,
      organization_slug: caseItem.organization_slug || 'jai-automobiles',
      org_id: caseItem.org_id || '11111111-1111-1111-1111-111111111111',
      synced_at: new Date().toISOString(),
    })
    const docRef = doc(firestore, 'cases', caseItem.id)
    await setDoc(docRef, cleanCase, { merge: true })
  } catch (err) {
    console.warn('Firestore case push notice:', err)
  }
}

/**
 * Merges cases received from Firebase Firestore into the local storage cache.
 * Dispatches a UI update event if any new records or assignments are found.
 */
export function mergeRemoteCases(remoteCases: MockCase[]): void {
  if (!remoteCases || remoteCases.length === 0) return

  const localCases = getStoredCases()
  let hasChanges = false
  const caseMap = new Map<string, MockCase>()

  // Index existing local cases
  localCases.forEach((c) => {
    if (c.id) caseMap.set(c.id, c)
    if (c.case_no) caseMap.set(c.case_no, c)
  })

  const updatedCases = [...localCases]

  remoteCases.forEach((remote) => {
    const existing = caseMap.get(remote.id) || (remote.case_no ? caseMap.get(remote.case_no) : undefined)
    if (!existing) {
      // Remote case is brand new (e.g., created on mobile)
      updatedCases.unshift(remote)
      caseMap.set(remote.id, remote)
      if (remote.case_no) caseMap.set(remote.case_no, remote)
      hasChanges = true
    } else {
      // Check if remote has newer assignment or status change
      const isRemoteNewer =
        !existing.updated_at ||
        (remote.updated_at && new Date(remote.updated_at).getTime() >= new Date(existing.updated_at).getTime())

      if (
        isRemoteNewer &&
        (existing.assigned_telecaller_id !== remote.assigned_telecaller_id ||
          existing.status !== remote.status ||
          existing.call_outcome !== remote.call_outcome)
      ) {
        const idx = updatedCases.findIndex((c) => c.id === existing.id || c.case_no === existing.case_no)
        if (idx >= 0) {
          updatedCases[idx] = { ...existing, ...remote }
          hasChanges = true
        }
      }
    }
  })

  if (hasChanges) {
    safeSetItem(STORAGE_KEYS.CASES, JSON.stringify(updatedCases))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dsa_os_cases_updated', { detail: { count: updatedCases.length } }))
    }
  }
}

/**
 * Syncs the local dataset with Firebase Firestore.
 * If cloud database is empty, seeds baseline multi-tier cases.
 */
export async function syncCasesWithCloud(): Promise<MockCase[]> {
  if (!isFirebaseConfigured() || !db) {
    return getStoredCases()
  }
  const firestore = db

  try {
    const casesRef = collection(firestore, 'cases')
    const q = query(casesRef, where('organization_slug', '==', 'jai-automobiles'))
    const snap = await getDocs(q)

    if (snap.empty) {
      // Cloud is empty: seed baseline multi-tier cases to Firestore
      const baselineCases = getStoredCases()
      try {
        const batch = writeBatch(firestore)
        baselineCases.forEach((c) => {
          const docRef = doc(firestore, 'cases', c.id)
          batch.set(docRef, sanitizeForFirestore({
            ...c,
            organization_slug: 'jai-automobiles',
            org_id: '11111111-1111-1111-1111-111111111111',
          }))
        })
        await batch.commit()
      } catch (seedErr) {
        console.warn('Initial Firestore seeding notice:', seedErr)
      }
      return baselineCases
    }

    const remoteCases: MockCase[] = []
    snap.forEach((docSnap) => {
      const data = docSnap.data() as MockCase
      remoteCases.push({ ...data, id: docSnap.id })
    })

    // Bi-directional sync: if local device storage has leads created offline or prior to Firestore activation, push them up
    const localCases = getStoredCases()
    const remoteIdSet = new Set<string>()
    remoteCases.forEach((r) => {
      if (r.id) remoteIdSet.add(r.id)
      if (r.case_no) remoteIdSet.add(r.case_no)
    })

    const localOnlyCases = localCases.filter(
      (c) => !remoteIdSet.has(c.id) && (!c.case_no || !remoteIdSet.has(c.case_no))
    )

    if (localOnlyCases.length > 0) {
      localOnlyCases.forEach((loc) => {
        syncCaseToCloud(loc).catch((err) => console.warn('Syncing local-only case notice:', err))
      })
    }

    mergeRemoteCases(remoteCases)

    // Sync parties collection from Firestore
    try {
      const partiesRef = collection(firestore, 'parties')
      const partiesSnap = await getDocs(partiesRef)
      if (!partiesSnap.empty) {
        const remoteParties: any[] = []
        partiesSnap.forEach((d) => remoteParties.push({ ...d.data(), id: d.id }))
        const local = getStoredParties()
        const map = new Map<string, any>()
        local.forEach((p) => map.set(p.id, p))
        let changed = false
        remoteParties.forEach((rp) => {
          if (!map.has(rp.id)) {
            local.unshift(rp)
            map.set(rp.id, rp)
            changed = true
          }
        })
        if (changed) {
          saveStoredParties(local)
        }
      } else {
        // Seed baseline parties to cloud
        const local = getStoredParties()
        local.forEach((p) => syncPartyToCloud(p).catch(() => {}))
      }
    } catch (partErr) {
      console.warn('Firestore parties sync notice:', partErr)
    }

    return getStoredCases()
  } catch (err) {
    console.warn('Firestore cloud fetch notice:', err)
    return getStoredCases()
  }
}

let cloudSyncInitialized = false

/**
 * Initializes real-time two-way cloud synchronization across all devices (Desktop, Mobile, Tablet).
 */
export function initCloudSync(): void {
  if (cloudSyncInitialized || typeof window === 'undefined') return
  cloudSyncInitialized = true

  if (!isFirebaseConfigured() || !db) return
  const firestore = db

  // 1. Initial pull and seed from cloud
  syncCasesWithCloud().catch((err) => console.warn('Initial cloud sync error:', err))

  // 2. Real-time multi-device subscription for cases
  try {
    const casesRef = collection(firestore, 'cases')
    const q = query(casesRef, where('organization_slug', '==', 'jai-automobiles'))
    onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) return
        const remoteCases: MockCase[] = []
        snapshot.forEach((docSnap) => {
          remoteCases.push({ ...(docSnap.data() as MockCase), id: docSnap.id })
        })
        mergeRemoteCases(remoteCases)
      },
      (err) => {
        console.warn('Real-time Firestore cases subscription notice:', err)
      }
    )
  } catch (err) {
    console.warn('Failed to attach Firestore cases listener:', err)
  }

  // 3. Real-time multi-device subscription for referral partner profiles
  try {
    const refProfilesRef = collection(firestore, 'referral_profiles')
    onSnapshot(
      refProfilesRef,
      (snapshot) => {
        if (snapshot.empty) return
        const remoteProfiles: any[] = []
        snapshot.forEach((d) => remoteProfiles.push({ ...d.data(), id: d.id }))
        const local = getStoredReferralProfiles()
        const map = new Map<string, any>()
        local.forEach((p) => map.set(p.id, p))
        let changed = false
        remoteProfiles.forEach((rp) => {
          if (!map.has(rp.id)) {
            local.unshift(rp)
            map.set(rp.id, rp)
            changed = true
          }
        })
        if (changed) {
          saveStoredReferralProfiles(local)
        }
      },
      (err) => console.warn('Real-time Firestore referrals listener notice:', err)
    )
  } catch (err) {
    console.warn('Failed to attach Firestore referrals listener:', err)
  }

  // 4. Real-time multi-device subscription for customer parties
  try {
    const partiesRef = collection(firestore, 'parties')
    onSnapshot(
      partiesRef,
      (snapshot) => {
        if (snapshot.empty) return
        const remoteParties: any[] = []
        snapshot.forEach((d) => remoteParties.push({ ...d.data(), id: d.id }))
        const local = getStoredParties()
        const map = new Map<string, any>()
        local.forEach((p) => map.set(p.id, p))
        let changed = false
        remoteParties.forEach((rp) => {
          if (!map.has(rp.id)) {
            local.unshift(rp)
            map.set(rp.id, rp)
            changed = true
          } else {
            const existing = map.get(rp.id)
            if (rp.version && rp.version > (existing.version || 0)) {
              const idx = local.findIndex((p) => p.id === rp.id)
              if (idx >= 0) {
                local[idx] = { ...existing, ...rp }
                changed = true
              }
            }
          }
        })
        if (changed) {
          saveStoredParties(local)
        }
      },
      (err) => console.warn('Real-time Firestore parties listener notice:', err)
    )
  } catch (err) {
    console.warn('Failed to attach Firestore parties listener:', err)
  }
}

export function addStoredCase(newCase: MockCase): void {
  const current = getStoredCases()
  const existingIdx = current.findIndex((c) => c.id === newCase.id || c.case_no === newCase.case_no)
  let updated: MockCase[]
  if (existingIdx >= 0) {
    updated = [...current]
    updated[existingIdx] = { ...updated[existingIdx], ...newCase }
  } else {
    updated = [newCase, ...current]
  }
  saveStoredCases(updated)

  // Asynchronously sync to Firebase Firestore for cross-device visibility
  syncCaseToCloud(newCase).catch((e) => console.warn('Background Firestore push notice:', e))
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

  // Asynchronously sync to Firebase Firestore for cross-device visibility
  syncCaseToCloud(updatedCase).catch((e) => console.warn('Background Firestore update notice:', e))
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

  // Sync referral profile to Firebase Firestore
  if (isFirebaseConfigured() && db) {
    try {
      const docRef = doc(db, 'referral_profiles', partner.id)
      setDoc(docRef, sanitizeForFirestore({
        ...partner,
        organization_slug: 'jai-automobiles',
        synced_at: new Date().toISOString(),
      }), { merge: true }).catch((e) => console.warn('Firestore referral sync notice:', e))
    } catch {}
  }
}

export function enrichReferralProfilesWithCaseMetrics(profiles: any[], allCases: MockCase[]): any[] {
  return profiles.map((p) => {
    const partnerLeads = allCases.filter((c: any) =>
      c.referral_profile_id === p.id ||
      (p.id && c.referral_partner_id === p.id) ||
      (p.mobile_primary && c.referral_partner_mobile === p.mobile_primary) ||
      (p.name && c.referral_partner_name?.toLowerCase().trim() === p.name.toLowerCase().trim())
    )

    const caseTotal = partnerLeads.length
    const caseInterested = partnerLeads.filter(
      (c: any) => c.call_outcome === 'interested' || c.status === 'interested'
    ).length
    const caseConverted = partnerLeads.filter(
      (c: any) => c.status === 'disbursed' || c.status === 'sanctioned' || c.status === 'converted'
    ).length
    const caseDisbursed = partnerLeads.filter(
      (c: any) => c.status === 'disbursed' || c.status === 'converted'
    ).length

    // Always prefer live derived counts if leads exist for this partner; fallback to profile counts for historical seed partners
    const totalLeads = caseTotal > 0 ? caseTotal : (p.total_leads || 0)
    const interestedLeads = caseTotal > 0 ? caseInterested : (p.interested_leads || 0)
    const convertedLeads = caseTotal > 0 ? caseConverted : (p.converted_leads || 0)

    return {
      ...p,
      total_leads: totalLeads,
      interested_leads: interestedLeads,
      converted_leads: convertedLeads,
      disbursed_leads: caseDisbursed,
    }
  })
}

// --- 3. Customer Registry & Parties Persistence ---

export interface StoredCustomerParty {
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
  active_cases_count?: number
  total_disbursed_volume?: number
}

export function isQualifyingCustomerStatus(status?: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return (
    s === 'sanctioned' ||
    s === 'disbursed' ||
    s === 'pdd_pending' ||
    s === 'pdd_completed' ||
    s === 'completed' ||
    s === 'converted'
  )
}

const INITIAL_BASELINE_PARTIES: StoredCustomerParty[] = [
  {
    id: 'p1',
    org_id: '11111111-1111-1111-1111-111111111111',
    name: 'Rajesh Kumar Sharma',
    mobile_primary: '9820198201',
    email: 'rajesh.sharma@gmail.com',
    pan_last_four: '9820',
    pan_masked: 'ABCDE****F',
    aadhaar_masked: '**** **** 1234',
    employment_type: 'salaried',
    city: 'Mumbai',
    state: 'Maharashtra',
    monthly_income: 85000,
    version: 1,
    created_at: '2025-01-01T10:00:00Z',
  },
  {
    id: 'p2',
    org_id: '11111111-1111-1111-1111-111111111111',
    name: 'Amitabh Singh Chauhan',
    mobile_primary: '9833441122',
    email: 'amitabh.chauhan@gmail.com',
    pan_last_four: '1122',
    pan_masked: 'BKDPA****M',
    aadhaar_masked: '**** **** 5678',
    employment_type: 'self_employed',
    city: 'Mumbai',
    state: 'Maharashtra',
    monthly_income: 140000,
    version: 1,
    created_at: '2025-01-02T11:00:00Z',
  },
  {
    id: 'p3',
    org_id: '11111111-1111-1111-1111-111111111111',
    name: 'Virender Singh Rathore',
    mobile_primary: '9845112233',
    email: 'virender.rathore@gmail.com',
    pan_last_four: '2233',
    pan_masked: 'AFXPR****K',
    aadhaar_masked: '**** **** 9012',
    employment_type: 'salaried',
    city: 'Pune',
    state: 'Maharashtra',
    monthly_income: 60000,
    version: 1,
    created_at: '2025-01-05T09:30:00Z',
  },
]

export function getStoredParties(): StoredCustomerParty[] {
  let parties: StoredCustomerParty[] = []
  const raw = safeGetItem(STORAGE_KEYS.PARTIES)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        parties = parsed
      }
    } catch {
      // Fallback
    }
  }

  if (parties.length === 0) {
    parties = [...INITIAL_BASELINE_PARTIES]
  }

  // Idempotently auto-reconcile all qualifying cases in getStoredCases()
  // so any case marked 'sanctioned' or 'disbursed' automatically has its customer record in the registry
  const allCases = getStoredCases()
  const partyMap = new Map<string, StoredCustomerParty>()
  parties.forEach((p) => {
    partyMap.set(p.id, p)
    if (p.mobile_primary) partyMap.set(p.mobile_primary, p)
  })

  let hasNew = false
  allCases.forEach((c) => {
    if (isQualifyingCustomerStatus(c.status)) {
      const mob = c.primary_applicant_mobile || c.mobile
      const existing = (c.party_id && partyMap.get(c.party_id)) ||
        (c.primary_party?.id && partyMap.get(c.primary_party.id)) ||
        (mob && partyMap.get(mob)) ||
        parties.find((p) => p.name.toLowerCase().trim() === (c.primary_applicant_name || c.applicant_name || '').toLowerCase().trim())

      if (!existing) {
        const partyId = c.primary_party?.id || c.party_id || `party-${c.id.replace('case-jai-', '')}`
        const newParty: StoredCustomerParty = {
          id: partyId,
          org_id: c.org_id || '11111111-1111-1111-1111-111111111111',
          name: c.primary_applicant_name || c.applicant_name || 'Customer',
          mobile_primary: mob || '9820011223',
          email: c.primary_party?.email || null,
          pan_last_four: c.primary_party?.pan_last_four || (c.primary_party?.pan_masked ? c.primary_party.pan_masked.slice(-4) : null),
          pan_masked: c.primary_party?.pan_masked || (c.primary_party?.pan ? `${c.primary_party.pan.slice(0, 5)}****${c.primary_party.pan.slice(-1)}` : 'ABCDE****F'),
          aadhaar_masked: c.primary_party?.aadhaar_masked || '**** **** 1234',
          employment_type: c.primary_party?.employment_type || 'salaried',
          city: c.primary_party?.city || 'Mumbai',
          state: c.primary_party?.state || 'Maharashtra',
          monthly_income: c.primary_party?.monthly_income || 75000,
          version: 1,
          created_at: c.created_at || new Date().toISOString(),
        }
        parties.unshift(newParty)
        partyMap.set(newParty.id, newParty)
        if (mob) partyMap.set(mob, newParty)
        hasNew = true
        syncPartyToCloud(newParty).catch(() => {})
      }
    }
  })

  if (hasNew || !raw) {
    safeSetItem(STORAGE_KEYS.PARTIES, JSON.stringify(parties))
  }

  return parties
}

export function saveStoredParties(parties: StoredCustomerParty[]): void {
  safeSetItem(STORAGE_KEYS.PARTIES, JSON.stringify(parties))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsa_os_parties_updated', { detail: { count: parties.length } }))
  }
}

export function syncPartyToCloud(party: StoredCustomerParty): Promise<void> {
  if (!isFirebaseConfigured() || !db) return Promise.resolve()
  try {
    const docRef = doc(db, 'parties', party.id)
    return setDoc(docRef, sanitizeForFirestore({
      ...party,
      organization_slug: 'jai-automobiles',
      synced_at: new Date().toISOString(),
    }), { merge: true }).catch((e) => console.warn('Firestore party sync notice:', e))
  } catch {
    return Promise.resolve()
  }
}

export function addOrUpdateStoredParty(party: StoredCustomerParty): StoredCustomerParty {
  const current = getStoredParties()
  const idx = current.findIndex((p) => p.id === party.id || (party.mobile_primary && p.mobile_primary === party.mobile_primary))
  let updated: StoredCustomerParty[]
  if (idx >= 0) {
    updated = [...current]
    updated[idx] = { ...updated[idx], ...party, version: (updated[idx].version || 1) + 1 }
  } else {
    updated = [party, ...current]
  }
  saveStoredParties(updated)
  syncPartyToCloud(party).catch(() => {})
  return party
}

export function syncCustomerFromCase(caseItem: MockCase): StoredCustomerParty | null {
  if (!isQualifyingCustomerStatus(caseItem.status)) {
    return null
  }

  const parties = getStoredParties()
  const mob = caseItem.primary_applicant_mobile || caseItem.mobile
  const existing = parties.find(
    (p) =>
      p.id === caseItem.party_id ||
      (caseItem.primary_party?.id && p.id === caseItem.primary_party.id) ||
      (mob && p.mobile_primary === mob) ||
      p.name.toLowerCase().trim() === (caseItem.primary_applicant_name || caseItem.applicant_name || '').toLowerCase().trim()
  )

  if (existing) {
    // Preserve existing customer and ensure case has party_id linked
    caseItem.party_id = existing.id
    return existing
  }

  const partyId = caseItem.primary_party?.id || caseItem.party_id || `party-${caseItem.id.replace('case-jai-', '')}`
  const newParty: StoredCustomerParty = {
    id: partyId,
    org_id: caseItem.org_id || '11111111-1111-1111-1111-111111111111',
    name: caseItem.primary_applicant_name || caseItem.applicant_name || 'Customer',
    mobile_primary: mob || '9820011223',
    email: caseItem.primary_party?.email || null,
    pan_last_four: caseItem.primary_party?.pan_last_four || (caseItem.primary_party?.pan_masked ? caseItem.primary_party.pan_masked.slice(-4) : null),
    pan_masked: caseItem.primary_party?.pan_masked || (caseItem.primary_party?.pan ? `${caseItem.primary_party.pan.slice(0, 5)}****${caseItem.primary_party.pan.slice(-1)}` : 'ABCDE****F'),
    aadhaar_masked: caseItem.primary_party?.aadhaar_masked || '**** **** 1234',
    employment_type: caseItem.primary_party?.employment_type || 'salaried',
    city: caseItem.primary_party?.city || 'Mumbai',
    state: caseItem.primary_party?.state || 'Maharashtra',
    monthly_income: caseItem.primary_party?.monthly_income || 75000,
    version: 1,
    created_at: caseItem.created_at || new Date().toISOString(),
  }

  caseItem.party_id = newParty.id
  addOrUpdateStoredParty(newParty)
  return newParty
}

// --- 4. Documents & OCR Scans Persistence ---

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

  // Check if case object itself has genuine documents attached
  const cases = getStoredCases()
  const targetCase = cases.find((c) => c.id === caseId || c.case_no === caseId)
  if (targetCase && Array.isArray((targetCase as any).documents) && (targetCase as any).documents.length > 0) {
    const cleaned = (targetCase as any).documents.map((d: any) => ({
      ...d,
      status: d.status === 'quarantined' ? 'received' : d.status,
      can_download: true,
    }))
    saveStoredDocuments(caseId, cleaned)
    return cleaned
  }

  // Only for static demo test fixtures (case-jai-101 to case-jai-106)
  if (targetCase && /^case-jai-10[1-6]$/.test(targetCase.id)) {
    const demoDocs = generateDeterministicOcrDocs({
      id: targetCase.id,
      case_no: targetCase.case_no || 'JA-2025-0101',
      applicant_name: (targetCase as any).primary_applicant_name || (targetCase as any).applicant_name || 'Rajesh Kumar Sharma',
      mobile: (targetCase as any).primary_applicant_mobile || (targetCase as any).mobile || '9820198201',
      vehicle_make: targetCase.vehicle?.make || 'Hyundai',
      vehicle_model: targetCase.vehicle?.model || 'Creta',
      vehicle_condition: targetCase.vehicle?.condition || targetCase.product_type || 'used',
      vehicle_reg_no: targetCase.vehicle?.registration_no,
      pincode: (targetCase as any).pincode || targetCase.primary_party?.pincode || '400053',
      city: targetCase.primary_party?.city || 'Mumbai',
      state: targetCase.primary_party?.state || 'Maharashtra',
    })
    saveStoredDocuments(caseId, demoDocs)
    return demoDocs
  }

  // Never fabricate fake documents for genuine leads (e.g. JA-2025-9086 / case-jai-1792306106473)
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

// ===========================================================================
// 5. Financing Partners (Master List, Admin Managed, Banks & NBFCs)
// ===========================================================================

export function getStoredFinancingPartners(): FinancingPartnerMaster[] {
  const raw = safeGetItem(STORAGE_KEYS.FINANCING_PARTNERS)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    } catch {}
  }
  const initial = [...DEFAULT_FINANCING_PARTNERS]
  safeSetItem(STORAGE_KEYS.FINANCING_PARTNERS, JSON.stringify(initial))
  return initial
}

export function saveStoredFinancingPartners(partners: FinancingPartnerMaster[]): void {
  safeSetItem(STORAGE_KEYS.FINANCING_PARTNERS, JSON.stringify(partners))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsa_os_financing_partners_updated'))
  }
}

export function addOrUpdateStoredFinancingPartner(partner: FinancingPartnerMaster): void {
  const current = getStoredFinancingPartners()
  const idx = current.findIndex((p) => p.id === partner.id)
  let updated: FinancingPartnerMaster[]
  if (idx >= 0) {
    updated = [...current]
    updated[idx] = { ...updated[idx], ...partner }
  } else {
    updated = [...current, partner]
  }
  saveStoredFinancingPartners(updated)

  if (isFirebaseConfigured() && db) {
    try {
      const docRef = doc(db, 'financingPartners', partner.id)
      setDoc(docRef, sanitizeForFirestore({
        ...partner,
        synced_at: new Date().toISOString(),
      }), { merge: true }).catch(() => {})
    } catch {}
  }
}

// ===========================================================================
// 6. Partner Allocations (Deterministic ID: ${leadId}_${financingPartnerId})
// ===========================================================================

export function getStoredPartnerAllocations(): FinancingPartnerAllocation[] {
  const raw = safeGetItem(STORAGE_KEYS.PARTNER_ALLOCATIONS)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch {}
  }
  return []
}

export function saveStoredPartnerAllocations(allocations: FinancingPartnerAllocation[]): void {
  safeSetItem(STORAGE_KEYS.PARTNER_ALLOCATIONS, JSON.stringify(allocations))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsa_os_partner_allocations_updated', { detail: { count: allocations.length } }))
  }
}

export function getAllocationsForLead(leadId: string): FinancingPartnerAllocation[] {
  const all = getStoredPartnerAllocations()
  return all.filter((a) => a.leadId === leadId)
}

export function addOrUpdateStoredPartnerAllocation(allocation: FinancingPartnerAllocation): void {
  const current = getStoredPartnerAllocations()
  const idx = current.findIndex((a) => a.id === allocation.id)
  let updated: FinancingPartnerAllocation[]
  if (idx >= 0) {
    updated = [...current]
    updated[idx] = { ...updated[idx], ...allocation }
  } else {
    updated = [allocation, ...current]
  }
  saveStoredPartnerAllocations(updated)

  // Cloud sync to Firestore partnerAllocations collection
  if (isFirebaseConfigured() && db) {
    try {
      const docRef = doc(db, 'partnerAllocations', allocation.id)
      setDoc(docRef, sanitizeForFirestore({
        ...allocation,
        synced_at: new Date().toISOString(),
      }), { merge: true }).catch((e) => console.warn('Firestore allocation sync notice:', e))
    } catch {}
  }
}

// ===========================================================================
// 7. Payout Policies (Versioned per Financing Partner)
// ===========================================================================

export const DEFAULT_SAMPLE_POLICIES: PayoutPolicy[] = [
  {
    id: 'pol-hdfc-2026',
    financingPartnerId: 'hdfc-bank',
    financingPartnerName: 'HDFC Bank',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    period: 'monthly',
    calculationBasis: 'sanctioned_amount',
    tierMode: 'slab',
    tiers: [
      { minAmount: 0, maxAmount: 2500000, ratePercent: 1.1 },
      { minAmount: 2500000, maxAmount: 5000000, ratePercent: 1.6 },
      { minAmount: 5000000, maxAmount: null, ratePercent: 2.1 },
    ],
  },
  {
    id: 'pol-sk-2026',
    financingPartnerId: 'sk-finance',
    financingPartnerName: 'SK Finance',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    period: 'monthly',
    calculationBasis: 'sanctioned_amount',
    tierMode: 'cliff',
    tiers: [
      { minAmount: 0, maxAmount: 1500000, ratePercent: 1.25 },
      { minAmount: 1500000, maxAmount: 3500000, ratePercent: 1.75 },
      { minAmount: 3500000, maxAmount: null, ratePercent: 2.25 },
    ],
  },
  {
    id: 'pol-axis-2026',
    financingPartnerId: 'axis-bank',
    financingPartnerName: 'Axis Bank',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    period: 'monthly',
    calculationBasis: 'sanctioned_amount',
    tierMode: 'slab',
    tiers: [
      { minAmount: 0, maxAmount: 2000000, ratePercent: 1.0 },
      { minAmount: 2000000, maxAmount: 4000000, ratePercent: 1.5 },
      { minAmount: 4000000, maxAmount: null, ratePercent: 2.0 },
    ],
  },
]

export function getStoredPayoutPolicies(): PayoutPolicy[] {
  const raw = safeGetItem(STORAGE_KEYS.PAYOUT_POLICIES)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    } catch {}
  }
  const initial = [...DEFAULT_SAMPLE_POLICIES]
  safeSetItem(STORAGE_KEYS.PAYOUT_POLICIES, JSON.stringify(initial))
  return initial
}

export function saveStoredPayoutPolicies(policies: PayoutPolicy[]): void {
  safeSetItem(STORAGE_KEYS.PAYOUT_POLICIES, JSON.stringify(policies))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsa_os_payout_policies_updated'))
  }
}

export function addOrUpdateStoredPayoutPolicy(policy: PayoutPolicy): void {
  const current = getStoredPayoutPolicies()
  const idx = current.findIndex((p) => p.id === policy.id)
  let updated: PayoutPolicy[]
  if (idx >= 0) {
    updated = [...current]
    updated[idx] = { ...updated[idx], ...policy }
  } else {
    updated = [policy, ...current]
  }
  saveStoredPayoutPolicies(updated)

  if (isFirebaseConfigured() && db) {
    try {
      const docRef = doc(db, 'payoutPolicies', policy.id)
      setDoc(docRef, sanitizeForFirestore({
        ...policy,
        synced_at: new Date().toISOString(),
      }), { merge: true }).catch(() => {})
    } catch {}
  }
}

// ===========================================================================
// 8. Payout Receipts (Money actually received from Financing Partners)
// ===========================================================================

export function getStoredPayoutReceipts(): PayoutReceipt[] {
  const raw = safeGetItem(STORAGE_KEYS.PAYOUT_RECEIPTS)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch {}
  }
  return []
}

export function saveStoredPayoutReceipts(receipts: PayoutReceipt[]): void {
  safeSetItem(STORAGE_KEYS.PAYOUT_RECEIPTS, JSON.stringify(receipts))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dsa_os_payout_receipts_updated'))
  }
}

export function addStoredPayoutReceipt(receipt: PayoutReceipt): void {
  const current = getStoredPayoutReceipts()
  const updated = [receipt, ...current]
  saveStoredPayoutReceipts(updated)

  if (isFirebaseConfigured() && db) {
    try {
      const docRef = doc(db, 'payoutReceipts', receipt.id)
      setDoc(docRef, sanitizeForFirestore({
        ...receipt,
        synced_at: new Date().toISOString(),
      }), { merge: true }).catch(() => {})
    } catch {}
  }
}

