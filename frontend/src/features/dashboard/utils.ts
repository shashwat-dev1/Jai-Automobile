/**
 * Formats a numeric or decimal string into Indian Rupee currency representation.
 */
export function formatINR(valStr?: string | number | null): string {
  if (valStr === undefined || valStr === null) return '₹0'
  const num = typeof valStr === 'string' ? parseFloat(valStr) || 0 : (Number(valStr) || 0)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num)
}
