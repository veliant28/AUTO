/**
 * Sanitize a decimal input value: allow only digits, comma, dot.
 * Keep at most `maxDecimals` decimal places.
 */
export function sanitizeDecimalInput(value: string, maxDecimals = 1): string {
  let val = value
    .replace(/[^\d,.]/g, '')
    .replace(/,+/g, ',')
    .replace(/\.+/g, '.')
    .replace(/,/g, '.')
  if (val.includes('.')) {
    const [int, dec] = val.split('.')
    val = int + '.' + (dec || '').slice(0, maxDecimals)
  }
  return val
}

/**
 * Format a number with spaces as thousand separators (Ukrainian locale style).
 */
export function fmt(n: number): string {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)
}
