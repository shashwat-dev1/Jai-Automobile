/**
 * DSA OS — Indian Validation Helpers & Mobile Utilities
 * Reusable functions for mobile numbers, registration plates, PIN codes, etc.
 */

/**
 * Normalizes any raw phone input to standard 10-digit Indian mobile format.
 * Strips '+91', leading '0', spaces, dashes, and non-numeric characters.
 */
export function normalizeIndianMobile(raw: string): string {
  if (!raw) return ''
  let digits = raw.replace(/\D/g, '')

  // Strip country code +91 or 91 if 12 digits
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2)
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // Strip leading trunk prefix 0
    digits = digits.slice(1)
  }

  // Keep up to 10 digits
  return digits.slice(0, 10)
}

/**
 * Strict validator for Indian mobile numbers:
 * - Exactly 10 digits
 * - First digit must be 6, 7, 8, or 9
 */
export function isValidIndianMobile(raw: string): boolean {
  const normalized = normalizeIndianMobile(raw)
  if (normalized.length !== 10) return false
  const firstDigit = normalized.charAt(0)
  return ['6', '7', '8', '9'].includes(firstDigit)
}

/**
 * Formats a 10-digit mobile number for display as "XXXXX XXXXX" (e.g. 98765 43210)
 * matching the visual reference design.
 */
export function formatIndianMobileDisplay(raw: string): string {
  const clean = normalizeIndianMobile(raw)
  if (clean.length <= 5) return clean
  return `${clean.slice(0, 5)} ${clean.slice(5)}`
}

/**
 * Validates standard 6-digit Indian Postal PIN code.
 */
export function isValidIndianPincode(pincode: string): boolean {
  const clean = pincode.replace(/\D/g, '')
  return clean.length === 6 && clean.charAt(0) !== '0'
}

/**
 * Basic validator for Indian vehicle registration number (e.g. MH 02 CK 4821).
 */
export function isValidVehicleRegNo(regNo: string): boolean {
  if (!regNo) return false
  const clean = regNo.toUpperCase().replace(/[^A-Z0-9]/g, '')
  // Indian vehicle registration: 2 letters (State) + 1-2 digits (RTO) + optional 1-3 letters + 1-4 digits
  const regRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/
  return clean.length >= 6 && clean.length <= 11 && regRegex.test(clean)
}
