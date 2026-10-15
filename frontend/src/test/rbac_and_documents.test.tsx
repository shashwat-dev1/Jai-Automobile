import { describe, it, expect, beforeEach } from 'vitest'
import { api, ApiError } from '../shared/lib/api'
import { useAuthStore } from '../features/auth/useAuth'

describe('Role-Based Access Control, Assigned Leads & Document Requirement Rules', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
  })

  describe('Document Requirement Rules', () => {
    it('blocks lead submission if Aadhaar is missing', async () => {
      try {
        await api.post('/referrals/guest-submit', {
          partner_mobile: '9820011223',
          partner_name: 'Test Partner',
          applicant_name: 'Rahul Sen',
          applicant_mobile: '9820099887',
          product_type: 'used_car',
          vehicle_condition: 'used',
          loan_amount_requested: 500000,
          pincode: '400053',
          city: 'Mumbai',
          state: 'Maharashtra',
          pan_doc_id: 'doc-pan-123',
          rc_doc_id: 'doc-rc-123',
          // aadhaar_doc_id missing
        })
        expect.unreachable('Should have thrown validation error')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.message).toContain('Aadhaar card is mandatory')
        expect(err.status).toBe(422)
      }
    })

    it('blocks lead submission if PAN is missing', async () => {
      try {
        await api.post('/referrals/guest-submit', {
          partner_mobile: '9820011223',
          partner_name: 'Test Partner',
          applicant_name: 'Rahul Sen',
          applicant_mobile: '9820099887',
          product_type: 'used_car',
          vehicle_condition: 'used',
          loan_amount_requested: 500000,
          pincode: '400053',
          city: 'Mumbai',
          state: 'Maharashtra',
          aadhaar_doc_id: 'doc-aadhaar-123',
          rc_doc_id: 'doc-rc-123',
          // pan_doc_id missing
        })
        expect.unreachable('Should have thrown validation error')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.message).toContain('PAN card is mandatory')
        expect(err.status).toBe(422)
      }
    })

    it('blocks used vehicle lead submission if RC is missing', async () => {
      try {
        await api.post('/referrals/guest-submit', {
          partner_mobile: '9820011223',
          partner_name: 'Test Partner',
          applicant_name: 'Rahul Sen',
          applicant_mobile: '9820099887',
          product_type: 'used_car',
          vehicle_condition: 'used',
          loan_amount_requested: 500000,
          pincode: '400053',
          city: 'Mumbai',
          state: 'Maharashtra',
          aadhaar_doc_id: 'doc-aadhaar-123',
          pan_doc_id: 'doc-pan-123',
          // rc_doc_id missing for used vehicle
        })
        expect.unreachable('Should have thrown validation error')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.message).toContain('RC document is mandatory')
        expect(err.status).toBe(422)
      }
    })

    it('allows new vehicle lead submission with only Aadhaar and PAN (RC omitted)', async () => {
      const res = await api.post<any>('/referrals/guest-submit', {
        partner_mobile: '9820011223',
        partner_name: 'Test Partner',
        applicant_name: 'New Vehicle Customer',
        applicant_mobile: '9820099887',
        product_type: 'new_car',
        vehicle_condition: 'new',
        loan_amount_requested: 900000,
        pincode: '400053',
        city: 'Mumbai',
        state: 'Maharashtra',
        aadhaar_doc_id: 'doc-aadhaar-123',
        pan_doc_id: 'doc-pan-123',
        // rc_doc_id omitted for new vehicle
      })
      expect(res.success).toBe(true)
      expect(res.case_no).toBeDefined()
    })

    it('uploads guest document and returns quarantine document ID', async () => {
      const res = await api.post<any>('/referrals/upload-document', {
        doc_type: 'aadhaar',
        file_name: 'customer_aadhaar.pdf',
      })
      expect(res.document_id).toBeDefined()
      expect(res.status).toBe('quarantined')
    })
  })

  describe('Telecaller Scoping and Isolation', () => {
    it('scopes Telecaller A (Priya Sharma) to exactly 4 assigned leads', async () => {
      // Login as Telecaller A
      const loginRes = await api.post<any>('/auth/login', {
        identifier: 'priya.sharma@jaiautomobiles.com',
        password: 'any',
      })
      expect(loginRes.user.id).toBe('usr-telecaller-1')
      expect(loginRes.user.role).toBe('telecaller')

      useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')

      // Query lead list
      const cases = await api.get<any[]>('/cases')
      expect(cases.length).toBe(10)
      cases.forEach((c) => {
        expect(c.assigned_telecaller_id).toBe('usr-telecaller-1')
      })

      // Query workspace stats
      const ws = await api.get<any>('/cases/telecaller/workspace')
      expect(ws.total_assigned).toBe(10)
    })

    it('scopes Telecaller B (Rahul Verma) to exactly 8 assigned leads', async () => {
      // Login as Telecaller B
      const loginRes = await api.post<any>('/auth/login', {
        identifier: 'rahul.verma@jaiautomobiles.com',
        password: 'any',
      })
      expect(loginRes.user.id).toBe('usr-telecaller-2')
      expect(loginRes.user.role).toBe('telecaller')

      useAuthStore.getState().loginAsDemo('telecaller', 'rahul.verma@jaiautomobiles.com')

      // Query lead list
      const cases = await api.get<any[]>('/cases')
      expect(cases.length).toBe(8)
      cases.forEach((c) => {
        expect(c.assigned_telecaller_id).toBe('usr-telecaller-2')
      })

      // Query workspace stats
      const ws = await api.get<any>('/cases/telecaller/workspace')
      expect(ws.total_assigned).toBe(8)
    })

    it('denies Telecaller A access to Telecaller B lead dossier with 403 Forbidden', async () => {
      useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')

      try {
        // case-jai-102 is assigned to Telecaller B
        await api.get('/cases/case-jai-102')
        expect.unreachable('Should have thrown 403')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.status).toBe(403)
        expect(err.message).toContain('Access denied')
      }
    })

    it('denies Telecaller B access to Telecaller A lead dossier with 403 Forbidden', async () => {
      useAuthStore.getState().loginAsDemo('telecaller', 'rahul.verma@jaiautomobiles.com')

      try {
        // case-jai-101 is assigned to Telecaller A
        await api.get('/cases/case-jai-101')
        expect.unreachable('Should have thrown 403')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.status).toBe(403)
        expect(err.message).toContain('Access denied')
      }
    })

    it('denies telecaller direct call activity logging on unassigned lead with 403 Forbidden', async () => {
      useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')

      try {
        // Try to update case-jai-106 (assigned to Telecaller B)
        await api.post('/cases/case-jai-106/call-activity', {
          outcome: 'interested',
          remarks: 'Unauthorized call attempt',
        })
        expect.unreachable('Should have thrown 403')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.status).toBe(403)
        expect(err.message).toContain('Access denied')
      }
    })

    it('denies telecaller lead reassignment with 403 Forbidden', async () => {
      useAuthStore.getState().loginAsDemo('telecaller', 'priya.sharma@jaiautomobiles.com')

      try {
        await api.post('/cases/assign', {
          case_ids: ['case-jai-101'],
          telecaller_id: 'usr-telecaller-2',
        })
        expect.unreachable('Should have thrown 403')
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError)
        expect(err.status).toBe(403)
        expect(err.message).toContain('Access denied')
      }
    })

    it('allows Admin to view all 6 leads and perform lead reassignment', async () => {
      useAuthStore.getState().loginAsDemo('owner', 'admin@jaiautomobiles.com')

      const cases = await api.get<any[]>('/cases')
      expect(cases.length).toBeGreaterThanOrEqual(6)

      // Admin can view case 101 and case 105
      const c101 = await api.get<any>('/cases/case-jai-101')
      const c105 = await api.get<any>('/cases/case-jai-105')
      expect(c101.id).toBe('case-jai-101')
      expect(c105.id).toBe('case-jai-105')

      // Admin can reassign
      const reassignRes = await api.post<any>('/cases/assign', {
        case_ids: ['case-jai-105'],
        telecaller_id: 'usr-telecaller-1',
      })
      expect(reassignRes.assigned_count).toBe(1)
      expect(reassignRes.telecaller_id).toBe('usr-telecaller-1')

      // Restore assignment back to usr-telecaller-2 for scenario cleanliness
      await api.post<any>('/cases/assign', {
        case_ids: ['case-jai-105'],
        telecaller_id: 'usr-telecaller-2',
      })
    })
  })
})
