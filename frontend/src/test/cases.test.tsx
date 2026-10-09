/**
 * Frontend Unit Tests — Case Domain & Components
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusChip from '../shared/components/StatusChip'
import { formatINR } from '../shared/lib/formatters'

describe('StatusChip', () => {
  it('renders lead status with neutral style', () => {
    render(<StatusChip status="lead" />)
    const chip = screen.getByText('Lead')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveClass('status-chip', 'status-lead')
  })

  it('renders sanctioned status with primary style', () => {
    render(<StatusChip status="sanctioned" />)
    const chip = screen.getByText('Sanctioned')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveClass('status-chip', 'status-sanctioned')
  })

  it('renders disbursed status with success style', () => {
    render(<StatusChip status="disbursed" />)
    const chip = screen.getByText('Disbursed')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveClass('status-chip', 'status-disbursed')
  })

  it('renders rejected status with danger style', () => {
    render(<StatusChip status="rejected" />)
    const chip = screen.getByText('Rejected')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveClass('status-chip', 'status-rejected')
  })
})

describe('Currency Formatter (INR)', () => {
  it('formats rupees with Indian commas and rupee symbol', () => {
    expect(formatINR(500000)).toBe('₹5,00,000')
    expect(formatINR(1250000)).toBe('₹12,50,000')
    expect(formatINR(0)).toBe('₹0')
  })
})
