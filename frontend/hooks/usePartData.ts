import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export function useCategories(modId: string | null) {
  return useQuery({
    queryKey: ['categories', modId],
    queryFn: async () => {
      if (!modId) return [];
      const { data } = await api.get(`/catalog/sections/${modId}`);
      return data;
    },
    enabled: !!modId,
  });
}

export function useParts(
  modId: string | null, 
  secId: string | null,
  filters?: {
    in_stock_only?: boolean;
    min_price?: number;
    max_price?: number;
    sort_by?: string;
    sort_order?: string;
  }
) {
  return useQuery({
    queryKey: ['parts', modId, secId, filters],
    queryFn: async () => {
      if (!modId || !secId) return [];
      const params: Record<string, any> = {};
      if (filters) {
        if (filters.in_stock_only) params.in_stock_only = true;
        if (filters.min_price) params.min_price = filters.min_price;
        if (filters.max_price) params.max_price = filters.max_price;
        if (filters.sort_by) params.sort_by = filters.sort_by;
        if (filters.sort_order) params.sort_order = filters.sort_order;
      }
      const { data } = await api.get(`/catalog/parts/${modId}/${secId}`, { params });
      return data;
    },
    enabled: !!modId && !!secId,
  });
}
