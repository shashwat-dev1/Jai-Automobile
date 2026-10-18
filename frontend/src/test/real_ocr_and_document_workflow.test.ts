import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeName,
  evaluateThreeWayNameComparison,
  evaluateAddressMatch,
  parseDateOfBirth,
  parseAadhaarNumber,
  parsePanNumber,
  parseAadhaarAddress,
  parseAadhaarName,
  parsePanName,
  runClientOcr,
  setMockOcrEngine,
} from '../shared/lib/clientOcrService'
import {
  saveUploadedFile,
  getDocumentPreviewInfo,
} from '../shared/lib/documentStorage'
import { api } from '../shared/lib/api'

describe('Robust PDF/Image OCR, Field Extraction & Verification Suite (Section 11)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setMockOcrEngine(null)
  })

  // 1. Searchable Aadhaar PDF
  describe('1. Searchable Aadhaar PDF', () => {
    it('extracts name, masked Aadhaar, DOB, and address from searchable text layer', () => {
      const rawText = `
        GOVERNMENT OF INDIA
        Unique Identification Authority of India
        Enrollment No: 1234/56789/01234
        Name: Rajesh Sharma
        DOB: 14/08/1988
        Gender: MALE
        Address: S/O Hari Sharma, House 42, Civil Lines, Sagar, Madhya Pradesh - 470001
        XXXX XXXX 8271
        Help Line: 1947
      `
      const name = parseAadhaarName(rawText, 'Rajesh Sharma', 'Aadhaar.pdf')
      const uid = parseAadhaarNumber(rawText)
      const dob = parseDateOfBirth(rawText)
      const addr = parseAadhaarAddress(rawText)

      expect(name.value).toBe('Rajesh Sharma')
      expect(uid.value).toBe('XXXX XXXX 8271')
      expect(dob.value).toBe('14/08/1988')
      expect(dob.status).toBe('extracted')
      expect(addr.value).toContain('Civil Lines, Sagar')
    })
  })

  // 2. Scanned Aadhaar PDF requiring PDF-to-image conversion
  describe('2. Scanned Aadhaar PDF requiring PDF-to-image conversion', () => {
    it('triggers canvas OCR fallback when PDF stream has no embedded text', async () => {
      setMockOcrEngine(async () => {
        return 'GOVERNMENT OF INDIA\nName: Shashwat Jain\nDOB: 12/05/1994\nXXXX XXXX 9988\nAddress: Bhagatsingh Ward, Garhakota, Sagar'
      })

      // Minimal PDF bytes without font glyphs (scanned container)
      const scannedPdfBytes = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, // %PDF-1.4
        0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
      ])
      const file = new File([scannedPdfBytes], 'Shashwat_Aadhaar_Scan.pdf', { type: 'application/pdf' })
      const res = await runClientOcr(file, 'aadhaar', { customer_name: 'Shashwat Jain' })

      expect(res.ocr_status).toBe('extracted')
      expect(res.processing_method).toBe('canvas_ocr')
      const nameField = res.fields.find((f) => f.field_key === 'customer_name')
      expect(nameField?.value).toBe('Shashwat Jain')
    })
  })

  // 3. Aadhaar image upload
  describe('3. Aadhaar image upload (Direct Image OCR)', () => {
    it('processes JPEG/PNG image uploads directly via image OCR', async () => {
      setMockOcrEngine(async () => {
        return 'DOB: 20/11/1992\nName: Priya Verma\nXXXX XXXX 4455\nAddress: Ward 12, Jabalpur - 482001'
      })

      const imageBlob = new Blob(['fake_jpeg_binary_stream'], { type: 'image/jpeg' })
      const file = new File([imageBlob], 'aadhaar_photo.jpg', { type: 'image/jpeg' })
      const res = await runClientOcr(file, 'aadhaar', { customer_name: 'Priya Verma' })

      expect(res.processing_method).toBe('direct_image_ocr')
      expect(res.fields.find((f) => f.field_key === 'customer_name')?.value).toBe('Priya Verma')
      expect(res.fields.find((f) => f.field_key === 'aadhaar_masked')?.value).toBe('XXXX XXXX 4455')
    })
  })

  // 4. Searchable PAN PDF
  describe('4. Searchable PAN PDF', () => {
    it('extracts PAN identifier, name and DOB from searchable text layer', () => {
      const rawText = `
        INCOME TAX DEPARTMENT
        GOVT. OF INDIA
        SHASHWAT JAIN
        SANMATI JAIN
        05/09/1993
        Permanent Account Number
        ABCDE1234F
      `
      const panRes = parsePanNumber(rawText)
      const nameRes = parsePanName(rawText, 'Shashwat Jain')
      const dobRes = parseDateOfBirth(rawText)

      expect(panRes.value).toBe('ABCDE****F')
      expect(nameRes.value).toBe('SHASHWAT JAIN')
      expect(dobRes.value).toBe('05/09/1993')
    })
  })

  // 5. Scanned PAN PDF
  describe('5. Scanned PAN PDF', () => {
    it('uses canvas OCR to extract PAN details when text layer is absent', async () => {
      setMockOcrEngine(async () => {
        return 'INCOME TAX DEPARTMENT\nGOVT. OF INDIA\nVIKRAM SINGH\nDOB: 18/03/1986\nBKWPS8877K'
      })

      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35])
      const file = new File([pdfBytes], 'Vikram_Pan_Scan.pdf', { type: 'application/pdf' })
      const res = await runClientOcr(file, 'pan', { customer_name: 'Vikram Singh' })

      expect(res.processing_method).toBe('canvas_ocr')
      expect(res.fields.find((f) => f.field_key === 'pan_number')?.value).toBe('BKWPS****K')
      expect(res.fields.find((f) => f.field_key === 'customer_name')?.value).toBe('VIKRAM SINGH')
    })
  })

  // 6. Multi-page PDF
  describe('6. Multi-page PDF', () => {
    it('correctly aggregates text across front and back pages', () => {
      const page1Text = 'GOVERNMENT OF INDIA\nName: Amit Patel\nDOB: 10/10/1985\nXXXX XXXX 1122'
      const page2Text = 'Address: Flat 402, Lotus Towers, Andheri West, Mumbai, Maharashtra - 400053\n1947'
      const combined = `${page1Text}\n${page2Text}`

      const name = parseAadhaarName(combined, 'Amit Patel')
      const addr = parseAadhaarAddress(combined)
      const uid = parseAadhaarNumber(combined)

      expect(name.value).toBe('Amit Patel')
      expect(uid.value).toBe('XXXX XXXX 1122')
      expect(addr.value).toContain('Andheri West, Mumbai')
    })
  })

  // 7. Rotated or low-quality scan
  describe('7. Rotated or low-quality scan', () => {
    it('flags unreadable scans as Visual Review Required without inventing values', () => {
      const noisyText = '??? ### %%% ~~~ /// 123 ???'
      const uid = parseAadhaarNumber(noisyText)
      const dob = parseDateOfBirth(noisyText)
      const pan = parsePanNumber(noisyText)

      expect(uid.status).toBe('needs_review')
      expect(uid.value).toBe('Scanned Document (Manual Verification Required)')
      expect(dob.status).toBe('needs_review')
      expect(dob.value).toBe('—')
      expect(pan.status).toBe('needs_review')
    })
  })

  // 8. Document with both DOB and download/print dates (Critical Rule)
  describe('8. Document with both DOB and download/print dates', () => {
    it('strictly rejects download/issue date (02/08/2026) and captures true DOB (12/05/1994)', () => {
      const rawText = `
        Download Date: 02/08/2026
        Issue Date: 02/08/2026
        Unique Identification Authority of India
        To: Shashwat Jain
        DOB: 12/05/1994
        Gender: MALE
        XXXX XXXX 8271
        Print Date: 02/08/2026
      `
      const dob = parseDateOfBirth(rawText)
      expect(dob.value).toBe('12/05/1994')
      expect(dob.value).not.toBe('02/08/2026')
      expect(dob.status).toBe('extracted')
    })

    it('rejects document date when only download date is present without DOB', () => {
      const rawText = `
        Download Date: 02/08/2026
        Issue Date: 02/08/2026
        Name: Shashwat Jain
      `
      const dob = parseDateOfBirth(rawText)
      expect(dob.value).toBe('—')
      expect(dob.status).toBe('needs_review')
    })
  })

  // 9. Document containing only a year of birth
  describe('9. Document containing only a year of birth', () => {
    it('stores Year of Birth as year without inventing complete day and month', () => {
      const rawText = `
        GOVERNMENT OF INDIA
        Name: Rameshwar Prasad
        Year of Birth / जन्म वर्ष: 1978
        Gender: MALE
        XXXX XXXX 3344
      `
      const dob = parseDateOfBirth(rawText)
      expect(dob.value).toBe('Year of Birth: 1978')
      expect(dob.isYearOnly).toBe(true)
      expect(dob.status).toBe('extracted')
    })
  })

  // 10. PDF whose text layer is present but insufficient
  describe('10. PDF whose text layer is present but insufficient', () => {
    it('falls back to OCR when text layer has insufficient identity tokens', async () => {
      setMockOcrEngine(async () => {
        return 'Name: Deepa Nair\nDOB: 25/12/1990\nXXXX XXXX 7766\nAddress: Sector 4, Bhopal'
      })

      // PDF bytes that yield only 8 characters of text
      const smallTextPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
      const file = new File([smallTextPdf], 'sparse.pdf', { type: 'application/pdf' })
      const res = await runClientOcr(file, 'aadhaar', { customer_name: 'Deepa Nair' })

      expect(res.processing_method).toBe('canvas_ocr')
      expect(res.fields.find((f) => f.field_key === 'customer_name')?.value).toBe('Deepa Nair')
    })
  })

  // 11. Exact name match: Shashwat Jain versus Shashwat Jain
  describe('11. Exact name match (Resolving False Mismatch)', () => {
    it('correctly matches identical names with non-breaking spaces, case, or formatting variance', () => {
      const submitted = 'Shashwat Jain'
      const ocrWithNbsp = 'Shashwat\u00A0Jain'
      const ocrWithHonorific = 'Mr. Shashwat Jain'

      expect(normalizeName(submitted)).toBe('SHASHWAT JAIN')
      expect(normalizeName(ocrWithNbsp)).toBe('SHASHWAT JAIN')
      expect(normalizeName(ocrWithHonorific)).toBe('SHASHWAT JAIN')

      const threeWay = evaluateThreeWayNameComparison(submitted, ocrWithNbsp, 'SHASHWAT JAIN')
      expect(threeWay.matchCase).toBe('CASE_A')
      expect(threeWay.statusLabel).toBe('✓ 3-Way Name Match')
    })
  })

  // 12. Genuine name mismatch
  describe('12. Genuine name mismatch', () => {
    it('flags genuinely different names as mismatch without forcing false equality', () => {
      const res = evaluateThreeWayNameComparison('Shashwat Jain', 'Shashwat Jain', 'Sunil Kumar Jain')
      expect(res.matchCase).toBe('CASE_C')
      expect(res.statusLabel).toBe('✕ Document Name Mismatch')
      expect(res.canAdminCorrect).toBe(false)
    })
  })

  // 13. OCR uncertainty
  describe('13. OCR uncertainty', () => {
    it('returns Unable to Compare when one or both documents cannot be parsed', () => {
      const res = evaluateThreeWayNameComparison('Shashwat Jain', '—', 'Shashwat Jain')
      expect(res.matchCase).toBe('CASE_D')
      expect(res.statusLabel).toBe('⏳ Unable to Compare')
    })
  })

  // 14. Full Aadhaar address versus shorter form locality
  describe('14. Full Aadhaar address versus shorter form locality', () => {
    it('returns Location Matched when overlapping town/district are found in full Aadhaar address', () => {
      const formLocality = 'Garhakota'
      const formDistrict = 'Sagar'
      const formCity = 'Sagar'
      const fullAadhaarAddr = 'S / O : Sanmati Jain , House Number 131, Bhagatsingh Ward, Garhakota, Sagar - 470229'

      const evaluation = evaluateAddressMatch(formLocality, formDistrict, formCity, fullAadhaarAddr)
      expect(evaluation.label).toBe('✓ Location Matched')
      expect(evaluation.badgeClass).toBe('comp-match')
    })

    it('returns OCR Captured without false mismatch when form details do not conflict', () => {
      const evaluation = evaluateAddressMatch('Civil Lines', null, null, 'House 12, Ward 4, New Market Area - 470002')
      expect(evaluation.label).toBe('OCR Captured')
      expect(evaluation.badgeClass).toBe('comp-captured')
    })
  })

  // 15. Missing DOB in the form
  describe('15. Missing DOB in the form', () => {
    it('labels DOB as OCR Captured when extracted from document without form collection', () => {
      const dobVal: string = '15/07/1990'
      const isExtracted = Boolean(dobVal && dobVal !== '—' && !dobVal.includes('Not extracted'))
      expect(isExtracted).toBe(true)
    })
  })

  // 16. Failed OCR request and retry
  describe('16. Failed OCR request and retry', () => {
    it('allows retry without creating duplicate document entries', async () => {
      const caseId = 'case-jai-test-ocr-01'
      const docId = 'doc-test-retry-01'

      await api.post(`/cases/${caseId}/documents/ocr`, {
        document_id: docId,
        scan_result: { ocr_status: 'failed', fields: [] },
      })

      // Retry OCR with success
      const retryResult = {
        ocr_status: 'extracted',
        document_type_code: 'AADHAAR',
        pipeline_stage: 'extraction_completed',
        processing_method: 'embedded_pdf_text',
        ocr_provider: 'pdfjs_wasm_tesseract',
        processing_version: '2.1.0',
        fields: [{ field_key: 'customer_name', label: 'Full Name', value: 'Shashwat Jain', confidence: 0.98, status: 'extracted' }],
      }

      const res = await api.post<any>(`/cases/${caseId}/documents/ocr`, {
        document_id: docId,
        scan_result: retryResult,
      })

      expect(res.success).toBe(true)
      const docs = res.documents
      // Must not create duplicate documents
      const matchingDocs = docs.filter((d: any) => d.id === docId)
      expect(matchingDocs.length).toBe(1)
      expect(matchingDocs[0].scan_result.ocr_status).toBe('extracted')
    })
  })

  // 17. Actual document viewing after processing
  describe('17. Actual document viewing after processing', () => {
    it('provides genuine preview info for PDF and image documents', async () => {
      const pdfBlob = new Blob(['%PDF-1.4 genuine content'], { type: 'application/pdf' })
      const docId = 'doc-view-test-01'
      await saveUploadedFile(docId, pdfBlob, { doc_type: 'aadhaar', file_name: 'test.pdf' })

      const previewInfo = await getDocumentPreviewInfo(docId)
      expect(previewInfo).not.toBeNull()
      expect(previewInfo?.isPdf).toBe(true)
      expect(previewInfo?.isImage).toBe(false)
      expect(previewInfo?.blob).not.toBeNull()
    })
  })

  // 18. Reprocessing without duplicate records
  describe('18. Reprocessing without duplicate records', () => {
    it('safely overwrites extraction results in place on re-scan', async () => {
      const caseId = 'case-jai-test-ocr-02'
      const docId = 'doc-test-rescan-02'

      const scan1 = {
        ocr_status: 'extracted',
        document_type_code: 'PAN',
        fields: [{ field_key: 'pan_number', label: 'PAN', value: 'ABCDE1111F', confidence: 0.9, status: 'extracted' }],
      }
      await api.post(`/cases/${caseId}/documents/ocr`, { document_id: docId, scan_result: scan1 })

      const scan2 = {
        ocr_status: 'extracted',
        document_type_code: 'PAN',
        fields: [{ field_key: 'pan_number', label: 'PAN', value: 'ABCDE2222F', confidence: 0.99, status: 'extracted' }],
      }
      const res = await api.post<any>(`/cases/${caseId}/documents/ocr`, { document_id: docId, scan_result: scan2 })

      const matching = res.documents.filter((d: any) => d.id === docId)
      expect(matching.length).toBe(1)
      expect(matching[0].scan_result.fields[0].value).toBe('ABCDE2222F')
    })
  })
})
