/**
 * Frontend Unit Tests — Post-Disbursal Documents (PDD) Components
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PDDCard } from '../features/pdd/PDDCard'
import { PDDStatusModal } from '../features/pdd/PDDStatusModal'
import type { PDDItem } from '../features/pdd/types'

describe('PDDCard Component', () => {
  const mockItem: PDDItem = {
    id: 'pdd-1',
    org_id: 'org-1',
    case_id: 'case-1',
    case_no: 'LOS-2026-901',
    applicant_name: 'Vikram Mehta',
    lender_application_id: 'app-1',
    lender_name: 'HDFC Bank',
    document_type: 'rc_hypothecation',
    title: 'RC Hypothecation Endorsement',
    description: 'Smart card with HP seal',
    status: 'pending',
    due_date: '2026-04-15',
    collected_at: null,
    submitted_to_lender_at: null,
    acknowledged_at: null,
    rejection_reason: null,
    lender_acknowledgement_ref: null,
    document_id: null,
    owner_id: null,
    owner_name: null,
    ageing_days: 4,
    ageing_bucket: '0_7',
    is_overdue: false,
    version: 1,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
  }

  it('renders PDD item details with fresh ageing bucket', () => {
    render(
      <MemoryRouter>
        <PDDCard item={mockItem} onOpenStatusModal={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByText('RC Hypothecation Endorsement')).toBeInTheDocument()
    expect(screen.getByText('LOS-2026-901')).toBeInTheDocument()
    expect(screen.getByText('• Bank: HDFC Bank')).toBeInTheDocument()
    expect(screen.getByText('0-7d (Fresh)')).toBeInTheDocument()
    expect(screen.getByText('Pending Collection')).toBeInTheDocument()
    expect(screen.getByText('4 days')).toBeInTheDocument()
  })

  it('renders overdue styling and label when is_overdue is true', () => {
    const overdueItem: PDDItem = {
      ...mockItem,
      is_overdue: true,
      ageing_bucket: '30_plus',
      ageing_days: 35,
    }

    render(
      <MemoryRouter>
        <PDDCard item={overdueItem} onOpenStatusModal={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByText(/⚠ OVERDUE/)).toBeInTheDocument()
    expect(screen.getByText('30+d (Critical)')).toBeInTheDocument()
  })

  it('triggers onOpenStatusModal with collected when clicking Mark Collected', () => {
    const onModalMock = vi.fn()
    render(
      <MemoryRouter>
        <PDDCard item={mockItem} onOpenStatusModal={onModalMock} />
      </MemoryRouter>
    )

    const btn = screen.getByText('Mark Collected 📥')
    fireEvent.click(btn)
    expect(onModalMock).toHaveBeenCalledWith(mockItem, 'collected')
  })
})

describe('PDDStatusModal Component', () => {
  const mockItem: PDDItem = {
    id: 'pdd-1',
    org_id: 'org-1',
    case_id: 'case-1',
    case_no: 'LOS-2026-901',
    applicant_name: 'Vikram Mehta',
    lender_application_id: 'app-1',
    lender_name: 'HDFC Bank',
    document_type: 'insurance_clause',
    title: 'Insurance Policy with Hypothecation Clause',
    description: null,
    status: 'sent_to_lender',
    due_date: '2026-03-20',
    collected_at: '2026-03-05T10:00:00Z',
    submitted_to_lender_at: '2026-03-06T10:00:00Z',
    acknowledged_at: null,
    rejection_reason: null,
    lender_acknowledgement_ref: null,
    document_id: null,
    owner_id: null,
    owner_name: null,
    ageing_days: 12,
    ageing_bucket: '8_15',
    is_overdue: false,
    version: 2,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-06T10:00:00Z',
  }

  it('renders acknowledgement modal fields', () => {
    render(
      <PDDStatusModal
        item={mockItem}
        targetStatus="acknowledged_by_lender"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    expect(screen.getByText('Record Bank Acknowledgement (PDD Complete)')).toBeInTheDocument()
    expect(screen.getByText(/Bank PDD Acknowledgement Number/i)).toBeInTheDocument()
  })

  it('requires rejection reason when marking rejected', () => {
    render(
      <PDDStatusModal
        item={mockItem}
        targetStatus="rejected"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    expect(screen.getByText('Record Bank Rejection / Query')).toBeInTheDocument()
    expect(screen.getByText(/Bank Rejection \/ Deficiency Reason/i)).toBeInTheDocument()
  })
})
