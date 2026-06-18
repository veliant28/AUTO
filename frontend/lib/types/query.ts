export interface ApiError {
  status: number
  message: string
  detail?: any
}

export interface ApiResponse<T> {
  status: string
  data?: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export type QueryKey = any
export type QueryFn = () => Promise<any>
