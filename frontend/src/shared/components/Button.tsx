import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './Button.css'

/**
 * DSA OS — Button Component
 *
 * Variants from docs/DESIGN_SYSTEM.md §7.1:
 *   primary   — Forest green, default action
 *   secondary — Brass accent, financial/payout actions ONLY
 *   outline   — Surface + border, secondary actions
 *   danger    — Error red, destructive/irreversible actions
 *   ghost     — No background, low-emphasis actions
 */

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  children: ReactNode
}

function Button({
  variant = 'outline',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      className={[
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        loading ? 'btn--loading' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      {...props}
    >
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {!loading && icon && <span className="btn-icon" aria-hidden="true">{icon}</span>}
      <span className="btn-label">{children}</span>
    </button>
  )
}

export default Button
