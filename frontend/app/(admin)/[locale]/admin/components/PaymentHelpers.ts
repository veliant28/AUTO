/** Payment helper functions extracted from admin/orders/page.tsx */

export function paymentBadgeClass(method: string): string {
  switch (method) {
    case 'monobank':
      return 'bg-black text-white dark:bg-white dark:text-black border-0 text-sm font-semibold'
    case 'novapay':
      return 'bg-purple-600 text-white border-0 text-sm font-semibold'
    case 'liqpay':
      return 'bg-green-600 text-white border-0 text-sm font-semibold'
    default:
      return 'bg-gray-500 text-white border-0 text-sm'
  }
}

export function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'monobank':
      return 'Monobank'
    case 'novapay':
      return 'NovaPay'
    case 'liqpay':
      return 'LiqPay'
    default:
      return method
  }
}
