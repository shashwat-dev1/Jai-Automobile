import React, { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker source
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
}

export interface PdfDocumentViewerProps {
  blob: Blob | null
  previewUrl?: string | null
  fileName: string
  isImage?: boolean
  onDownload?: () => void
}

export const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  blob,
  previewUrl,
  fileName,
  isImage,
  onDownload,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [numPages, setNumPages] = useState<number>(1)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [pdfDoc, setPdfDoc] = useState<any | null>(null)

  const isImgFile =
    Boolean(isImage) ||
    Boolean(blob && blob.type.startsWith('image/')) ||
    fileName.match(/\.(jpeg|jpg|png|webp|gif)$/i) !== null

  // If file is an image, render img directly
  if (isImgFile && previewUrl) {
    return (
      <div className="pdf-viewer-canvas-wrap" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={previewUrl}
          alt={fileName}
          className="real-doc-image"
          style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' }}
        />
      </div>
    )
  }

  // PDF.js canvas renderer initialization
  useEffect(() => {
    let active = true
    if (!blob) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setRenderError(null)

    blob.arrayBuffer()
      .then((buf) => {
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(buf),
          useSystemFonts: true,
        })
        return loadingTask.promise
      })
      .then((pdf) => {
        if (!active) return
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)
        setCurrentPage(1)
        setIsLoading(false)
      })
      .catch((err) => {
        if (!active) return
        console.warn('PDF.js render init notice:', err)
        setRenderError(err?.message || 'Failed to initialize PDF renderer')
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [blob])

  // Render current page onto canvas
  useEffect(() => {
    let renderTask: any = null
    if (!pdfDoc || !canvasRef.current) return

    pdfDoc.getPage(currentPage).then((page: any) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const context = canvas.getContext('2d')
      if (!context) return

      const unscaledViewport = page.getViewport({ scale: 1.0 })
      const containerWidth = canvas.parentElement?.clientWidth || 720
      const targetScale = Math.min(Math.max(containerWidth / unscaledViewport.width, 0.9), 1.8)
      const viewport = page.getViewport({ scale: targetScale })

      canvas.height = viewport.height
      canvas.width = viewport.width

      renderTask = page.render({
        canvasContext: context,
        viewport,
      })
      renderTask.promise.catch((e: any) => {
        if (e?.name !== 'RenderingCancelledException') {
          console.warn('Page render notice:', e)
        }
      })
    })

    return () => {
      if (renderTask && typeof renderTask.cancel === 'function') {
        try {
          renderTask.cancel()
        } catch {}
      }
    }
  }, [pdfDoc, currentPage])

  if (renderError) {
    return (
      <div className="pdf-embed-fallback-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: '#F8FAFC', borderRadius: 8 }}>
        <div className="pdf-icon-badge" style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📄</div>
        <h4 style={{ margin: '0.5rem 0', color: '#0F172A', fontSize: '1.1rem' }}>{fileName}</h4>
        <p style={{ color: '#64748B', fontSize: '0.875rem', margin: '0 0 1.25rem 0', maxWidth: 420 }}>
          Direct canvas display was not supported for this document. Open in native viewer or download the original file.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="stitch-btn-primary"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem' }}
            >
              <span>Open in Fullscreen Viewer ↗</span>
            </a>
          )}
          {onDownload && (
            <button
              type="button"
              className="stitch-btn-secondary"
              onClick={onDownload}
              style={{ padding: '0.5rem 1rem' }}
            >
              <span>Download Original File ⬇</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-canvas-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxHeight: '68vh', overflowY: 'auto' }}>
      {isLoading && (
        <div style={{ padding: '2.5rem', color: '#64748B', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="profile-spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
          <span>Rendering authentic document scan...</span>
        </div>
      )}

      {/* PDF Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100%',
          display: isLoading ? 'none' : 'block',
          borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          background: '#FFFFFF',
        }}
      />

      {/* Multi-page controls */}
      {numPages > 1 && !isLoading && (
        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.8125rem', color: '#334155', background: '#F1F5F9', padding: '0.35rem 0.75rem', borderRadius: 6 }}>
          <button
            type="button"
            className="stitch-btn-secondary"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
          >
            ‹ Prev Page
          </button>
          <span style={{ fontWeight: 600 }}>Page {currentPage} of {numPages}</span>
          <button
            type="button"
            className="stitch-btn-secondary"
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
          >
            Next Page ›
          </button>
        </div>
      )}
    </div>
  )
}
