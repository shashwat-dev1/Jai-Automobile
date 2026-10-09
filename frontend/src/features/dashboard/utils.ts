/**
 * Formats a numeric or decimal string into Indian Rupee currency representation.
 */
export function formatINR(valStr: string | number): string {
  const num = typeof valStr === 'string' ? parseFloat(valStr) || 0 : valStr
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num)
}
