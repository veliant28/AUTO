/**
 * Формат телефона как в таблице заказов: +38 (XXX) XXX-XX-XX.
 * Берутся последние 10 цифр номера, префикс +38.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return phone
  const d = digits.slice(-10)
  return `+38 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`
}
