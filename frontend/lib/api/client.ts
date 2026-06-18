import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios'
import { STORAGE_KEYS } from '@/lib/constants'
import type { ApiClientConfig } from './types'

export class ApiClient {
  private client: AxiosInstance
  private unauthorizedHandled = false

  constructor(config: ApiClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...config.defaultHeaders,
      },
    })

    this.client.interceptors.request.use((config) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.TOKEN) : null
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401 && typeof window !== 'undefined') {
          this.handleUnauthorized()
        }
        return Promise.reject(error)
      },
    )
  }

  /**
   * On the first 401: clear the stale token and auth state so React Query
   * consumers get `isAuthenticated: false` and stop sending authorized
   * requests.  A one-shot flag (`unauthorizedHandled`) prevents multiple
   * 401s from triggering redundant cleanup.
   */
  private handleUnauthorized() {
    if (this.unauthorizedHandled) return
    this.unauthorizedHandled = true

    const hadToken = !!localStorage.getItem(STORAGE_KEYS.TOKEN)
    localStorage.removeItem(STORAGE_KEYS.TOKEN)
    localStorage.removeItem(STORAGE_KEYS.AUTH)

    // Only reload if there *was* a token — the user had an active session
    // that is now invalid.  Guests hitting 401 should not be disturbed.
    if (hadToken) {
      window.location.href = '/login'
    }
  }

  /** Reset the flag (e.g. after a successful login). */
  resetUnauthorized() {
    this.unauthorizedHandled = false
  }

  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config)
  }

  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config)
  }

  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config)
  }

  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config)
  }
}

const apiClient = new ApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
})

export { apiClient }
