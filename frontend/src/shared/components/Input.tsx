import type { InputHTMLAttributes, ReactNode } from 'react'
import './Input.css'

/**
 * DSA OS — Input Component
 *
 * Design spec: docs/DESIGN_SYSTEM.md §7.4
 * - Background: --color-surface
 * - Border: 1px --color-border
 * - Focus: 1.5px --color-primary outline, no glow ring
 * - Height: 36px (default), 40px (large)
 * - Error: border changes to --status-error-text
 */

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: string
  error?: string
  hint?: string
  prefix?: ReactNode    // e.g. "₹" or "+91"
  suffix?: ReactNode    // e.g. unit label
  size?: 'md' | 'lg'
  id: string           // Required for label association
}

function Input({
  label,
  error,
  hint,
  prefix,
  suffix,
  size = 'md',
  id,
  className,
  ...props
}: InputProps) {
  return (
    <div className={['input-group', className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={id} className="input-label">
          {label}
          {props.required && <span className="input-required" aria-hidden="true"> *</span>}
        </label>
      )}

      <div
        className={[
          'input-wrapper',
          `input-wrapper--${size}`,
          error ? 'input-wrapper--error' : '',
          props.disabled ? 'input-wrapper--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {prefix && (
          <span className="input-prefix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          className="input-field"
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
          {...props}
        />
        {suffix && (
          <span className="input-suffix" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>

      {error && (
        <p id={`${id}-error`} className="input-error" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${id}-hint`} className="input-hint">
          {hint}
        </p>
      )}
    </div>
  )
}

export default Input
