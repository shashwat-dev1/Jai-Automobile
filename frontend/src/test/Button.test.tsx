/**
 * DSA OS — Button component tests
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Button from '@shared/components/Button'

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button id="test-btn">Save Case</Button>)
    expect(screen.getByRole('button', { name: 'Save Case' })).toBeInTheDocument()
  })

  it('applies primary variant class', () => {
    render(<Button variant="primary">Submit</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('btn--primary')
  })

  it('applies danger variant class', () => {
    render(<Button variant="danger">Delete</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('btn--danger')
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled and shows aria-busy when loading', () => {
    render(<Button loading>Loading</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    let clicked = false
    render(<Button onClick={() => { clicked = true }}>Click</Button>)
    await user.click(screen.getByRole('button'))
    expect(clicked).toBe(true)
  })

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup()
    let clicked = false
    render(<Button disabled onClick={() => { clicked = true }}>Click</Button>)
    await user.click(screen.getByRole('button'))
    expect(clicked).toBe(false)
  })
})

/**
 * Formatter tests
 */
import { formatINR, maskSensitive } from '@shared/lib/formatters'

describe('formatINR', () => {
  it('formats standard amounts with Indian grouping', () => {
    const result = formatINR(1250000)
    expect(result).toContain('12,50,000')
  })

  it('returns dash for null', () => {
    expect(formatINR(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatINR(undefined)).toBe('—')
  })

  it('handles zero correctly', () => {
    const result = formatINR(0)
    expect(result).toContain('0')
  })
})

describe('maskSensitive', () => {
  it('masks middle characters', () => {
    const result = maskSensitive('ABCDE1234F')
    expect(result.startsWith('AB')).toBe(true)
    expect(result.endsWith('4F')).toBe(true)
    expect(result).toContain('•')
  })

  it('returns dash for null', () => {
    expect(maskSensitive(null)).toBe('—')
  })
})
