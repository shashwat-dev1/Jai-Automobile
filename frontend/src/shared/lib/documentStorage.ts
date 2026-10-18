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

function safeCreateObjectURL(blob: Blob, docId: string): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(blob)
    } catch {}
  }
  return `blob:dsaos-${docId}`
}

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
  
  const blobUrl = safeCreateObjectURL(blob, docId)
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
 * Extracts embedded JPEG images from a scanned PDF byte buffer.
 * In Indian KYC uploads, scanned PDFs created by mobile apps or scanners
 * contain the authentic scanned photo as a JPEG (0xFF 0xD8 ... 0xFF 0xD9).
 */
export function extractEmbeddedImageFromPdf(bytes: Uint8Array): Blob | null {
  const endstreamBytes = [101, 110, 100, 115, 116, 114, 101, 97, 109] // 'endstream'
  
  // Strategy 1: Find JPEG ending immediately before an 'endstream' token
  for (let i = 0; i <= bytes.length - endstreamBytes.length; i++) {
    let match = true
    for (let k = 0; k < endstreamBytes.length; k++) {
      if (bytes[i + k] !== endstreamBytes[k]) {
        match = false
        break
      }
    }
    if (match) {
      let eoi = -1
      for (let j = i - 1; j >= Math.max(0, i - 100); j--) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          eoi = j + 2
          break
        }
      }
      if (eoi !== -1) {
        for (let s = eoi - 4; s >= 0; s--) {
          if (bytes[s] === 0xff && bytes[s + 1] === 0xd8) {
            const jpegBytes = bytes.slice(s, eoi)
            if (jpegBytes.length > 500) {
              return new Blob([jpegBytes], { type: 'image/jpeg' })
            }
          }
        }
      }
    }
  }

  // Strategy 2: Look for direct SOI (0xFF, 0xD8) and look forward for matching EOI (0xFF, 0xD9)
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      for (let j = bytes.length - 2; j > i + 100; j--) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          const slice = bytes.slice(i, j + 2)
          if (slice.length > 2000) {
            return new Blob([slice], { type: 'image/jpeg' })
          }
        }
      }
    }
  }
  return null
}

const previewBlobUrls = new Map<string, string>()

export interface DocumentPreviewInfo {
  url: string
  isImage: boolean
  isPdf: boolean
  blob: Blob | null
}

/**
 * Retrieve the active viewing URL for a document.
 * Returns either an image preview info or authentic application/pdf blob info.
 */
export async function getDocumentPreviewInfo(docId: string): Promise<DocumentPreviewInfo | null> {
  const rawBlob = await getDocumentBlob(docId)
  if (!rawBlob) return null

  const isImage = rawBlob.type.startsWith('image/')
  const isPdf = !isImage && (rawBlob.type === 'application/pdf' || rawBlob.type.includes('pdf'))
  
  let url = previewBlobUrls.get(docId)
  if (!url) {
    url = safeCreateObjectURL(rawBlob, docId)
    previewBlobUrls.set(docId, url)
  }

  return {
    url,
    isImage,
    isPdf,
    blob: rawBlob,
  }
}

/**
 * Retrieve the active viewing URL for a document.
 * Returns a blob: URL for native iframe/img rendering.
 */
export async function getDocumentViewUrl(docId: string): Promise<string | null> {
  const info = await getDocumentPreviewInfo(docId)
  return info?.url || null
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
