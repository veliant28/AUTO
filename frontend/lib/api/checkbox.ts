import { apiClient } from './client'

export interface CheckboxReceiptResponse {
  id: number
  order_id: number
  receipt_id: string | null
  status: string
  fiscal_code: string | null
  fiscal_date: string | null
  receipt_url: string | null
  error_message: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CheckboxReceiptCreateResponse {
  success: boolean
  receipt_id: string | null
  receipt_url: string | null
  status: string
  message: string | null
}

export interface CheckboxReceiptLinkResponse {
  url: string
}

export interface CheckboxSettingsResponse {
  has_checkbox_api_key: boolean
  checkbox_api_key_masked: string | null
  checkbox_organization_id: string | null
  checkbox_is_test: boolean
}

export interface CheckboxSettingsUpdate {
  checkbox_api_key?: string | null
  checkbox_organization_id?: string | null
  checkbox_is_test?: boolean
}

/**
 * Get fiscal receipt info for an order
 */
export async function getReceipt(
  orderId: number,
): Promise<CheckboxReceiptResponse | null> {
  const { data } = await apiClient.get(
    `/admin/checkbox/orders/${orderId}/receipt`,
  )
  return data
}

/**
 * Create a fiscal receipt for an order
 */
export async function createReceipt(
  orderId: number,
): Promise<CheckboxReceiptCreateResponse> {
  const { data } = await apiClient.post(
    `/admin/checkbox/orders/${orderId}/receipt`,
  )
  return data
}

/**
 * Get receipt view link
 */
export async function getReceiptLink(
  orderId: number,
): Promise<CheckboxReceiptLinkResponse> {
  const { data } = await apiClient.get(
    `/admin/checkbox/orders/${orderId}/receipt/link`,
  )
  return data
}

/**
 * Public endpoint: get receipt link for own order (customer-facing)
 */
export async function getOrderReceiptLink(
  orderId: number,
): Promise<CheckboxReceiptLinkResponse> {
  const { data } = await apiClient.get(`/orders/${orderId}/receipt-link`)
  return data
}

/**
 * Get Checkbox settings
 */
export async function getCheckboxSettings(): Promise<CheckboxSettingsResponse> {
  const { data } = await apiClient.get('/admin/settings')
  return {
    has_checkbox_api_key: data.has_checkbox_api_key ?? false,
    checkbox_api_key_masked: data.checkbox_api_key_masked ?? null,
    checkbox_organization_id: data.checkbox_organization_id ?? null,
    checkbox_is_test: data.checkbox_is_test ?? true,
  }
}
