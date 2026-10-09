/**
 * Frontend Unit Tests — Document Hub & Checklist Components
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RequestMessageModal } from '../features/documents/RequestMessageModal'

describe('RequestMessageModal', () => {
  it('renders pre-composed WhatsApp request message with case number and customer name', () => {
    const testMessage =
      'Dear Rajesh Kumar, please share clear copies of Salary Slips and Bank Statement for loan file LOS-10025.'

    render(
      <RequestMessageModal
        caseNo="LOS-10025"
        customerName="Rajesh Kumar"
        message={testMessage}
        missingCount={2}
        isOpen={true}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('Document Request Message')).toBeInTheDocument()
    expect(
      screen.getByText(/Case: LOS-10025 • Rajesh Kumar • 2 pending mandatory document\(s\)/)
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue(testMessage)).toBeInTheDocument()
    expect(screen.getByText('Copy to Clipboard')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(
      <RequestMessageModal
        caseNo="LOS-10025"
        customerName="Rajesh Kumar"
        message="Test"
        missingCount={1}
        isOpen={false}
        onClose={() => {}}
      />
    )

    expect(screen.queryByText('Document Request Message')).not.toBeInTheDocument()
  })
})
