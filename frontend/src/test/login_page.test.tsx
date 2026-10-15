/**
 * DSA OS — Jai Automobiles Login Page & Demo Access Acceptance Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from '../features/auth/LoginPage'
import { DemoAccessBar, DEMO_CREDENTIALS } from '../features/auth/DemoAccessBar'
import { useAuthStore } from '../features/auth/useAuth'

describe('Jai Automobiles Login Experience', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    vi.clearAllMocks()
  })

  it('renders Jai Automobiles brand identity and form elements', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    )

    // Check brand headers
    expect(screen.getAllByText('Jai Automobiles').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('VEHICLE FINANCE').length).toBeGreaterThanOrEqual(1)

    // Check Form headings
    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to continue.')).toBeInTheDocument()

    // Check inputs
    const emailInput = screen.getByLabelText('Email')
    expect(emailInput).toBeInTheDocument()
    expect(emailInput).toHaveAttribute('type', 'email')

    const passwordInput = screen.getByLabelText('Password')
    expect(passwordInput).toBeInTheDocument()
    expect(passwordInput).toHaveAttribute('type', 'password')

    // Check submit button
    const submitBtn = screen.getByRole('button', { name: /Sign In/i })
    expect(submitBtn).toBeInTheDocument()
  })

  it('toggles password visibility between password and text without losing input value', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    )

    const passwordInput = screen.getByLabelText('Password')
    await user.clear(passwordInput)
    await user.type(passwordInput, 'CustomPass@987')

    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(passwordInput).toHaveValue('CustomPass@987')

    // Find and click the toggle button
    const toggleBtn = screen.getByLabelText('Show password')
    await user.click(toggleBtn)

    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(passwordInput).toHaveValue('CustomPass@987')

    // Click again to hide
    const hideBtn = screen.getByLabelText('Hide password')
    await user.click(hideBtn)

    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(passwordInput).toHaveValue('CustomPass@987')
  })

  it('toggles remember device checkbox state', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    )

    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()

    await user.click(checkbox)
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('pre-fills credentials safely when a demo profile is clicked', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    )

    // Click Priya (Telecaller) demo profile
    const priyaBtns = screen.getAllByRole('button', { name: /Priya/i })
    await user.click(priyaBtns[0])

    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Password')

    expect(emailInput).toHaveValue('priya.sharma@jaiautomobiles.com')
    expect(passwordInput).toHaveValue('JaiAuto@123')

    // Click Admin demo profile
    const adminBtns = screen.getAllByRole('button', { name: /Admin/i })
    await user.click(adminBtns[0])

    expect(emailInput).toHaveValue('admin@jaiautomobiles.com')
    expect(passwordInput).toHaveValue('JaiAuto@123')
  })

  it('shows required field validation when submitting with empty email', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    )

    const emailInput = screen.getByLabelText('Email')
    await user.clear(emailInput)

    const submitBtn = screen.getByRole('button', { name: /Sign In/i })
    await user.click(submitBtn)

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your email address.')
  })

  it('authenticates user and redirects to root dashboard or workspace', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div data-testid="dashboard-view">DSA Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    )

    const submitBtn = screen.getByRole('button', { name: /Sign In/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument()
    })
  })

  it('opens and closes the password assistance modal when forgot password is clicked', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    )

    const forgotLinks = screen.getAllByRole('button', { name: /Forgot password\?/i })
    await user.click(forgotLinks[0])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Credential Assistance')).toBeInTheDocument()
    expect(screen.getByText('admin@jaiautomobiles.com')).toBeInTheDocument()

    // Dismiss modal
    const closeBtn = screen.getByRole('button', { name: 'Understood' })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

describe('DemoAccessBar Isolation & Removability', () => {
  it('renders all demo profiles without crashing', () => {
    const handleSelect = vi.fn()
    render(
      <DemoAccessBar
        onSelectCredential={handleSelect}
        activeIdentifier="admin@jaiautomobiles.com"
      />
    )

    expect(screen.getByText('Demo Access:')).toBeInTheDocument()
    expect(screen.getByText('DEMO:')).toBeInTheDocument()

    // Verify all credentials are present
    DEMO_CREDENTIALS.forEach((cred) => {
      expect(screen.getAllByRole('button', { name: new RegExp(cred.mobileLabel, 'i') }).length).toBeGreaterThan(0)
    })
  })

  it('calls onSelectCredential with matching credential when clicked', async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()
    render(
      <DemoAccessBar
        onSelectCredential={handleSelect}
        activeIdentifier="admin@jaiautomobiles.com"
      />
    )

    const rahulBtn = screen.getAllByRole('button', { name: /Rahul/i })[0]
    await user.click(rahulBtn)

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'rahul.verma@jaiautomobiles.com',
        roleKey: 'telecaller',
      })
    )
  })
})
