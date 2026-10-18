/**
 * DSA OS — Secure Client-Side Document Storage (IndexedDB + Blob Cache)
 * 
 * Provides persistent private storage for actual uploaded document bytes (PDFs, images)
 * so that authorized administrators and telecallers can inspect genuine uploaded files,
 * preview them in native viewers (iframe/img), and download the exact original files.
 */

const DB_NAME = 'dsaos_document_store'
const DB_VERSION = 1
const STORE_NAME = 'documents'

export interface StoredDocFile {
  id: string
  case_id?: string
  doc_type: string
  file_name: string
  mime_type: string
  file_size: number
  blob: Blob
  data_url?: string
  uploaded_at: string
}

// In-memory cache for active blobs and URLs
const activeBlobUrls = new Map<string, string>()
const activeBlobs = new Map<string, Blob>()

// Open IndexedDB
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null)
      return
    }
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result as IDBDatabase
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Save an uploaded file in the persistent document store.
 */
export async function saveUploadedFile(
  docId: string,
  file: File | Blob,
  meta: {
    doc_type: string
    file_name: string
    case_id?: string
    mime_type?: string
  }
): Promise<string> {
  const mimeType = meta.mime_type || file.type || 'application/pdf'
  const blob = file instanceof Blob ? file : new Blob([file], { type: mimeType })
  activeBlobs.set(docId, blob)
  
  // Create authorized blob URL safely
  let blobUrl = `blob:dsaos-${docId}`
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      blobUrl = URL.createObjectURL(blob)
    } catch {}
  }
  activeBlobUrls.set(docId, blobUrl)

  try {
    const db = await openDb()
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const docRecord: StoredDocFile = {
        id: docId,
        case_id: meta.case_id,
        doc_type: meta.doc_type,
        file_name: meta.file_name,
        mime_type: mimeType,
        file_size: blob.size,
        blob,
        uploaded_at: new Date().toISOString(),
      }
      store.put(docRecord)
    }
  } catch (err) {
    console.warn('Document IndexedDB write notice (fallback to in-memory blob):', err)
  }

  return blobUrl
}

/**
 * Retrieve the active viewing URL for a document.
 * Returns a blob: URL for native iframe/img rendering.
 */
export async function getDocumentViewUrl(docId: string): Promise<string | null> {
  // Check memory cache first
  if (activeBlobUrls.has(docId)) {
    return activeBlobUrls.get(docId)!
  }

  if (activeBlobs.has(docId)) {
    const b = activeBlobs.get(docId)!
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const u = URL.createObjectURL(b)
        activeBlobUrls.set(docId, u)
        return u
      } catch {}
    }
    return `blob:dsaos-${docId}`
  }

  try {
    const db = await openDb()
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const record = await new Promise<StoredDocFile | undefined>((resolve, reject) => {
        const req = store.get(docId)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      if (record && record.blob) {
        activeBlobs.set(docId, record.blob)
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          try {
            const url = URL.createObjectURL(record.blob)
            activeBlobUrls.set(docId, url)
            return url
          } catch {}
        }
        return `blob:dsaos-${docId}`
      }
    }
  } catch (err) {
    console.warn('Document IndexedDB read notice:', err)
  }

  return null
}

/**
 * Retrieve the raw Blob for download or processing.
 */
export async function getDocumentBlob(docId: string): Promise<Blob | null> {
  if (activeBlobs.has(docId)) {
    return activeBlobs.get(docId)!
  }
  try {
    const db = await openDb()
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const record = await new Promise<StoredDocFile | undefined>((resolve, reject) => {
        const req = store.get(docId)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      if (record?.blob) {
        activeBlobs.set(docId, record.blob)
        return record.blob
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Download the exact original uploaded file.
 */
export async function downloadStoredDocument(docId: string, fallbackName: string): Promise<boolean> {
  const blob = await getDocumentBlob(docId)
  let url = activeBlobUrls.get(docId)
  if (!url && blob) {
    url = URL.createObjectURL(blob)
  }

  if (url) {
    const a = document.createElement('a')
    a.href = url
    a.download = fallbackName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return true
  }

  return false
}
