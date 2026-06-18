import { z } from 'zod'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface ApiClientConfig {
  baseURL: string
  defaultHeaders?: Record<string, string>
}

// ─── Auth ──────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string
  token_type: string
  user_id: number
  role: string
  avatar_index?: number
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  first_name: string
}

export interface ProfileUpdateRequest {
  full_name?: string
  first_name?: string
  last_name?: string
  phone?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

// ─── Catalog ───────────────────────────────────────────────────────────

export interface PartResponse {
  id: number
  article: string
  brand: string
  name: string
  price: number
  quantity?: number
  supplier_name?: string
}

export interface BrandResponse {
  id: number
  name: string
  group: string
}

export interface ModelResponse {
  id: number
  name: string
  brand_id: number
}

export interface PartSearchParams {
  q: string
  limit?: number
}

// ─── Cart ──────────────────────────────────────────────────────────────

export interface CartAddRequest {
  part_id: number
  quantity?: number
  supplier_offer_id?: number
}

export interface CartUpdateRequest {
  quantity: number
}

// ─── Orders ────────────────────────────────────────────────────────────

export interface OrderResponse {
  id: number
  status: string
  total: number
  created_at: string
  items?: OrderItemResponse[]
}

export interface OrderItemResponse {
  id: number
  article: string
  name: string
  quantity: number
  price: number
}

export interface CheckoutRequest {
  last_name: string
  first_name: string
  middle_name?: string
  phone: string
  delivery_type: string
  delivery_city?: string
  delivery_warehouse?: string
  payment_method: string
  items: Array<{ part_id: number; quantity: number; price: number }>
}

// ─── Favorites ─────────────────────────────────────────────────────────

export interface FavoritesAddRequest {
  part_id: number
}

// ─── Zod validation schemas ──────────────────────────────────────────

export const PartSchema = z.object({
  id: z.number(),
  article: z.string(),
  brand: z.string(),
  name: z.string(),
  price: z.number(),
  quantity: z.number().optional(),
  supplier_name: z.string().optional(),
})

export type Part = z.infer<typeof PartSchema>

export const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  first_name: z.string(),
  role: z.string(),
})

export type User = z.infer<typeof UserSchema>

export const OrderSchema = z.object({
  id: z.number(),
  status: z.string(),
  total: z.number(),
  created_at: z.string(),
})

export type Order = z.infer<typeof OrderSchema>
