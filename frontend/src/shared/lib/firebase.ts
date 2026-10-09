import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

/**
 * Firebase Configuration for Jai Automobiles
 * Values are injected via Vite environment variables (.env / Vercel Environment Variables)
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB5CGen801Nox6LRgrDASig5qktJUJ3Y_c',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'jai-automobile.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'jai-automobile',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'jai-automobile.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '25306628005',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:25306628005:web:75ad69c0098f40abcd724c',
}

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  )
}

let app: FirebaseApp | undefined
let auth: Auth | undefined
let db: Firestore | undefined
let storage: FirebaseStorage | undefined

if (isFirebaseConfigured()) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  auth = getAuth(app)
  db = getFirestore(app)
  storage = getStorage(app)
}

export { app, auth, db, storage }
