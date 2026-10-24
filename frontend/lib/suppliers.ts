/**
 * Цвета и короткие подписи бейджей поставщиков — единые для админки
 * (список позиций заказа, результаты поиска товаров и т.п.).
 */
export const supplierBadgeColors: Record<string, string> = {
  UTR: 'bg-red-500 text-white',
  GPL: 'bg-orange-500 text-white',
  'AUTONOVA-D': 'bg-blue-500 text-white',
  'AUTONOVA D': 'bg-blue-500 text-white',
}

export const supplierBadgeLabels: Record<string, string> = {
  'AUTONOVA-D': 'AND',
  'AUTONOVA D': 'AND',
}

export function supplierBadgeLabel(
  supplier: string | null | undefined,
): string {
  if (!supplier) return '—'
  return supplierBadgeLabels[supplier] || supplier
}

export function supplierBadgeClass(
  supplier: string | null | undefined,
): string {
  if (!supplier) return 'bg-gray-500 text-white'
  return supplierBadgeColors[supplier] || 'bg-gray-500 text-white'
}
