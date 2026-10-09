import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from './firebase'
import { JAI_MOCK_CASES, JAI_MOCK_PDD, JAI_MOCK_EXPECTATIONS } from './mockDatabase'

/**
 * Real Firebase Service Layer for Jai Automobiles
 * Handles Auth, Firestore collections, and Storage bucket uploads.
 */

export interface FirebaseUserProfile {
  uid: string
  email: string
  name: string
  role: 'owner' | 'manager' | 'processor' | 'accountant' | 'field_executive' | 'auditor'
  organization_slug: string
}

const ROLE_FROM_EMAIL: Record<string, FirebaseUserProfile['role']> = {
  'owner@jaiautomobiles.com': 'owner',
  'manager@jaiautomobiles.com': 'manager',
  'processor@jaiautomobiles.com': 'processor',
  'accountant@jaiautomobiles.com': 'accountant',
  'field@jaiautomobiles.com': 'field_executive',
  'auditor@jaiautomobiles.com': 'auditor',
}

const NAME_FROM_ROLE: Record<string, string> = {
  owner: 'Aarav Sharma (Managing Director)',
  manager: 'Priya Patel (Branch Manager)',
  processor: 'Rohan Verma (Sr. Loan Processor)',
  accountant: 'Sanjay Gupta (Chief Accountant)',
  field_executive: 'Kavita Singh (Field Officer)',
  auditor: 'Meera Iyer (Internal Auditor)',
}

// 1. Authentication with Auto-Provisioning
export async function loginWithFirebase(identifier: string, pass: string): Promise<FirebaseUserProfile> {
  if (!auth || !db) {
    throw new Error('Firebase is not yet configured.')
  }

  let uid: string

  try {
    const credential = await signInWithEmailAndPassword(auth, identifier, pass)
    uid = credential.user.uid
  } catch (err: unknown) {
    const errorCode = (err as { code?: string })?.code
    // If user does not exist yet, automatically create account in Firebase Auth
    if (errorCode === 'auth/user-not-found' || errorCode === 'auth/invalid-credential') {
      try {
        const newCredential = await createUserWithEmailAndPassword(auth, identifier, pass)
        uid = newCredential.user.uid

        const inferredRole = ROLE_FROM_EMAIL[identifier] || 'owner'
        const inferredName = NAME_FROM_ROLE[inferredRole] || 'Jai Auto Staff'

        const newUserProfile: FirebaseUserProfile = {
          uid,
          email: identifier,
          name: inferredName,
          role: inferredRole,
          organization_slug: 'jai-automobiles',
        }

        // Save profile to Firestore
        await setDoc(doc(db, 'users', uid), {
          ...newUserProfile,
          created_at: serverTimestamp(),
        })

        // Seed initial collections into Firestore if needed
        seedFirestoreDatabase().catch((e) => console.warn('Background seed notice:', e))

        return newUserProfile
      } catch (createErr) {
        throw createErr
      }
    }
    throw err
  }

  // Fetch role from Firestore users collection
  try {
    const usersRef = collection(db, 'users')
    const q = query(usersRef, where('uid', '==', uid))
    const snap = await getDocs(q)

    if (!snap.empty) {
      return snap.docs[0].data() as FirebaseUserProfile
    }
  } catch {
    // Continue with inferred profile
  }

  const role = ROLE_FROM_EMAIL[identifier] || 'owner'
  return {
    uid,
    email: identifier,
    name: NAME_FROM_ROLE[role] || 'Jai Auto Staff',
    role,
    organization_slug: 'jai-automobiles',
  }
}

export async function logoutFromFirebase(): Promise<void> {
  if (auth) {
    await fbSignOut(auth)
  }
}

// 2. Cases Management
export async function getCasesFromFirestore() {
  if (!db) return JAI_MOCK_CASES

  try {
    const casesRef = collection(db, 'cases')
    const snap = await getDocs(casesRef)
    if (snap.empty) {
      return JAI_MOCK_CASES
    }
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.warn('Firestore fetch failed, returning fallback state:', err)
    return JAI_MOCK_CASES
  }
}

export async function createCaseInFirestore(caseData: Record<string, unknown>) {
  if (!db) throw new Error('Firebase Firestore is not initialized.')

  const caseId = (caseData.id as string) || `CASE-${Date.now()}`
  const docRef = doc(db, 'cases', caseId)
  await setDoc(docRef, {
    ...caseData,
    created_at: serverTimestamp(),
    organization_slug: 'jai-automobiles',
  })
  return { id: caseId, ...caseData }
}

// 3. Document Upload (Direct Firestore Base64 Fallback - Zero Blaze Plan Required)
export async function uploadDocumentToFirebase(file: File, caseId: string, documentType: string) {
  const docId = `doc-${Date.now()}`

  // Convert file to Base64 data URL
  const base64Data = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })

  let finalUrl = base64Data

  // If Firebase Storage is available, attempt cloud bucket upload
  if (storage) {
    try {
      const storageRef = ref(storage, `documents/jai-automobiles/${caseId}/${documentType}_${Date.now()}_${file.name}`)
      const snapshot = await uploadBytes(storageRef, file)
      finalUrl = await getDownloadURL(snapshot.ref)
    } catch {
      // Storage requires Blaze plan: fallback silently to direct Firestore document storage
      finalUrl = base64Data
    }
  }

  // Record document in Firestore collection (100% Free on Spark Plan)
  if (db) {
    try {
      const docMetaRef = doc(db, 'case_documents', docId)
      await setDoc(docMetaRef, {
        id: docId,
        case_id: caseId,
        document_type: documentType,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        download_url: finalUrl,
        created_at: serverTimestamp(),
        organization_slug: 'jai-automobiles',
      })
    } catch (dbErr) {
      console.warn('Firestore doc save notice:', dbErr)
    }
  }

  return { downloadUrl: finalUrl, fileName: file.name, id: docId }
}

// 4. Initial Seed to populate Firebase with Jai Automobiles default data
export async function seedFirestoreDatabase(): Promise<{ success: boolean; message: string }> {
  if (!db) {
    return { success: false, message: 'Firebase not configured.' }
  }

  try {
    // Seed cases
    for (const c of JAI_MOCK_CASES) {
      await setDoc(doc(db, 'cases', c.id), {
        ...c,
        created_at: serverTimestamp(),
        organization_slug: 'jai-automobiles',
      })
    }

    // Seed PDD records
    for (const p of JAI_MOCK_PDD.items) {
      await setDoc(doc(db, 'pdd_records', p.id), {
        ...p,
        created_at: serverTimestamp(),
        organization_slug: 'jai-automobiles',
      })
    }

    // Seed payout expectations
    for (const exp of JAI_MOCK_EXPECTATIONS) {
      await setDoc(doc(db, 'payout_expectations', exp.id), {
        ...exp,
        created_at: serverTimestamp(),
        organization_slug: 'jai-automobiles',
      })
    }

    return { success: true, message: 'Jai Automobiles database seeded successfully into Firebase!' }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Failed to seed: ${errorMsg}` }
  }
}
