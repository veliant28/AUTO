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

export interface PaymentInitResponse {
  success: boolean
  transaction_id: number | null
  payment_url: string | null
  message: string | null
}

export interface PaymentMethodsResponse {
  methods: PaymentMethodInfo[]
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
