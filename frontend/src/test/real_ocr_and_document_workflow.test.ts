import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeName,
  evaluateThreeWayNameComparison,
} from '../shared/lib/clientOcrService'
import {
  saveUploadedFile,
  getDocumentViewUrl,
  getDocumentBlob,
} from '../shared/lib/documentStorage'
import { api } from '../shared/lib/api'
import { useAuthStore } from '../features/auth/useAuth'

describe('Real OCR, Three-Way Name Comparison & Secure Document Flow', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('Name Normalization', () => {
    it('normalizes names by trimming, upper-casing, removing honorifics and collapsing whitespace', () => {
      expect(normalizeName('  Mr.  Rajesh   Kumar  Sharma  ')).toBe('RAJESH KUMAR SHARMA')
      expect(normalizeName('Shri Shashwat Jain')).toBe('SHASHWAT JAIN')
      expect(normalizeName('DR. VIKRAMADITYA RATHORE')).toBe('VIKRAMADITYA RATHORE')
    })
  })

  describe('Three-Way Name Comparison Decision Matrix (Section 4)', () => {
    it('Case A: All three names match', () => {
      const res = evaluateThreeWayNameComparison(
        'Shashwat Jain',
        'Shashwat Jain',
        'SHASHWAT JAIN'
      )
      expect(res.matchCase).toBe('CASE_A')
      expect(res.statusLabel).toBe('✓ 3-Way Name Match')
      expect(res.canAdminCorrect).toBe(false)
      expect(res.recommendedCorrection).toBe(null)
    })

    it('Case B: Aadhaar and PAN match each other, but differ from submitted form name', () => {
      const res = evaluateThreeWayNameComparison(
        'Shashwat J.',
        'Shashwat Jain',
        'Shashwat Jain'
      )
      expect(res.matchCase).toBe('CASE_B')
      expect(res.statusLabel).toBe('⚠️ Form Name Discrepancy')
      expect(res.canAdminCorrect).toBe(true)
      expect(res.recommendedCorrection).toBe('Shashwat Jain')
      expect(res.explanation).toContain('differ from the submitted referral form')
    })

    it('Case C: Aadhaar and PAN names differ from each other', () => {
      const res = evaluateThreeWayNameComparison(
        'Shashwat Jain',
        'Shashwat Jain',
        'Shashwat Kumar'
      )
      expect(res.matchCase).toBe('CASE_C')
      expect(res.statusLabel).toBe('✕ Document Name Mismatch')
      expect(res.canAdminCorrect).toBe(false)
      expect(res.recommendedCorrection).toBe(null)
    })

    it('Case D: One or both documents cannot be read or are pending', () => {
      const res1 = evaluateThreeWayNameComparison(
        'Shashwat Jain',
        '—',
        'Shashwat Jain'
      )
      expect(res1.matchCase).toBe('CASE_D')
      expect(res1.statusLabel).toBe('⏳ Unable to Compare')

      const res2 = evaluateThreeWayNameComparison(
        'Shashwat Jain',
        'Shashwat Jain',
        '—'
      )
      expect(res2.matchCase).toBe('CASE_D')
      expect(res2.statusLabel).toBe('⏳ Unable to Compare')
    })
  })

  describe('Admin-Only Customer Name Correction (Section 5)', () => {
    it('rejects telecaller attempts to correct customer name with 403 Forbidden', async () => {
      useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')
      await expect(
        api.post('/cases/case-jai-101/correct-name', {
          new_name: 'Rajesh Sharma',
          reason: 'Aadhaar and PAN match',
        })
      ).rejects.toThrow(/Only authorized administrators/i)
    })

    it('allows administrator to correct customer name and updates audit history', async () => {
      useAuthStore.getState().loginAsDemo('admin', 'aarav.sharma@jaiautomobiles.com')
      const res = await api.post<any>('/cases/case-jai-101/correct-name', {
        new_name: 'Rajesh Kumar Sharma',
        reason: 'Matched against verified Aadhaar and PAN documents',
      })
      expect(res.case_id).toBe('case-jai-101')
      expect(res.primary_applicant_name).toBe('Rajesh Kumar Sharma')

      // Verify updated record has audit history
      const c = await api.get<any>('/cases/case-jai-101')
      expect(c.primary_applicant_name).toBe('Rajesh Kumar Sharma')
      const history = c.call_activity_history || []
      const correctionLog = history.find((h: any) => h.remarks?.includes('Corrected customer name'))
      expect(correctionLog).toBeDefined()
    })
  })

  describe('Secure Document Storage & Preview (Section 6)', () => {
    it('persists and retrieves authentic document blob without metadata-only stubbing', async () => {
      const dummyFile = new Blob(['%PDF-1.4 genuine pdf file bytes for test'], {
        type: 'application/pdf',
      })
      const docId = 'doc-test-genuine-001'
      const viewUrl = await saveUploadedFile(docId, dummyFile, {
        doc_type: 'aadhaar',
        file_name: 'test_aadhaar.pdf',
      })
      expect(viewUrl).toBeDefined()
      expect(viewUrl).toContain(docId)

      const retrievedBlob = await getDocumentBlob(docId)
      expect(retrievedBlob).not.toBeNull()
      expect(retrievedBlob?.size).toBe(dummyFile.size)

      const retrievedUrl = await getDocumentViewUrl(docId)
      expect(retrievedUrl).toBe(viewUrl)
    })
  })
})
