import { apiClient } from './client'

export interface PaymentMethodInfo {
  code: string
  name: string
  enabled: boolean
}

export interface PaymentTransactionResponse {
  id: number
  order_id: number
  payment_method: string
  amount: number
  status: string
  provider_tx_id: string | null
  payment_url: string | null
  invoice_url: string | null
  receipt_url: string | null
  error_message: string | null
  created_at: string | null
  updated_at: string | null
}

export interface PaymentForm {
  action: string
  method?: string
  fields: Record<string, string>
}

export interface PaymentInitResponse {
  success: boolean
  transaction_id: number | null
  payment_url: string | null
  /** Форма оплаты для form-based провайдеров (LiqPay): {action, method, fields} */
  payment_form: PaymentForm | null
  message: string | null
}

export interface PaymentMethodsResponse {
  methods: PaymentMethodInfo[]
}

/**
 * Отправить покупателя на оплату: если провайдер вернул payment_form —
 * сабмитим скрытую HTML-форму (официальный способ LiqPay: POST на
 * /api/3/checkout с полями data/signature), иначе открываем payment_url.
 */
export function openPayment(result: {
  payment_url?: string | null
  payment_form?: PaymentForm | null
}): boolean {
  const form = result?.payment_form
  if (form?.action && form?.fields) {
    try {
      const el = document.createElement('form')
      el.method = (form.method || 'POST').toUpperCase()
      el.action = form.action
      el.target = '_blank'
      el.rel = 'noopener'
      for (const [name, value] of Object.entries(form.fields)) {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = name
        input.value = value
        el.appendChild(input)
      }
      document.body.appendChild(el)
      el.submit()
      document.body.removeChild(el)
      return true
    } catch {
      // ниже — fallback на payment_url
    }
  }
  if (result?.payment_url) {
    window.open(result.payment_url, '_blank', 'noopener,noreferrer')
    return true
  }
  return false
}

/**
 * Get available payment methods (public, for checkout)
 */
export async function fetchPaymentMethods(): Promise<PaymentMethodsResponse> {
  const { data } = await apiClient.get('/payments/methods')
  return data
}

/**
 * Initialize a payment for an order (admin)
 */
export async function initPayment(
  orderId: number,
  method: string,
): Promise<PaymentInitResponse> {
  const { data } = await apiClient.post(
    `/admin/payments/orders/${orderId}/init?method=${method}`,
  )
  return data
}

/**
 * Get transaction info for an order (admin)
 */
export async function getTransaction(
  orderId: number,
): Promise<PaymentTransactionResponse> {
  const { data } = await apiClient.get(
    `/admin/payments/orders/${orderId}/transaction`,
  )
  return data
}

/**
 * Cancel a pending invoice for an order (admin)
 */
export async function cancelInvoice(
  orderId: number,
): Promise<{ status: string; message: string }> {
  const { data } = await apiClient.post(
    `/admin/payments/orders/${orderId}/cancel-invoice`,
  )
  return data
}
