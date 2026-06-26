import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export function useParts(
  categoryId: string | null,
  options?: {
    page?: number
    page_size?: number
    in_stock_only?: boolean
    min_price?: number
    max_price?: number
    sort_by?: string
    sort_order?: string
    mod_id?: number | string | null
  },
) {
  return useQuery({
    queryKey: ['parts', categoryId, options],
    queryFn: async () => {
      if (!categoryId) return { items: [], total: 0, page: 1, page_size: 24 }
      const modId = options?.mod_id ? Number(options.mod_id) : 0
      const params: Record<string, any> = {
        page: options?.page ?? 1,
        page_size: options?.page_size ?? 24,
      }
      if (options?.in_stock_only) params.in_stock_only = true
      if (options?.min_price) params.min_price = options.min_price
      if (options?.max_price) params.max_price = options.max_price
      if (options?.sort_by) params.sort_by = options.sort_by
      if (options?.sort_order) params.sort_order = options.sort_order
      const { data } = await api.get(`/catalog/parts/${modId}/${categoryId}`, {
        params,
      })
      return data
    },
    enabled: !!categoryId,
  })
}
