/**
 * DSA OS — Financial and Display Formatters
 */

/**
 * Format numerical amounts to Indian Rupees (INR) format.
 * E.g. 1250000 -> "₹12,50,000"
 * Returns "—" for null or undefined.
 */
export function formatINR(amount?: number | null, options?: { showPaise?: boolean }): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '—'
  }

  const hasDecimals = options?.showPaise || (!Number.isInteger(amount) && options?.showPaise !== false)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount)
}

/**
 * Format percentage. E.g. 1.25 -> "1.25%"
 */
export function formatPercent(rate?: number | null): string {
  if (rate === null || rate === undefined || isNaN(rate)) {
    return '—'
  }
  return `${rate}%`
}

/**
 * Masks sensitive values like PAN or Aadhaar, showing only first 2 and last 2 characters.
 * E.g. ABCDE1234F -> AB••••••4F
 */
export function maskSensitive(val?: string | null): string {
  if (!val) {
    return '—'
  }
  const str = String(val).trim()
  if (str.length <= 4) {
    return str
  }
  const first2 = str.slice(0, 2)
  const last2 = str.slice(-2)
  const maskedLength = str.length - 4
  const mask = '•'.repeat(maskedLength)
  return `${first2}${mask}${last2}`
}

/**
 * Format date to standard Indian financial format: DD MMM YYYY
 */
export function formatDate(dateStr?: string | Date | null): string {
  if (!dateStr) return '—'
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}
