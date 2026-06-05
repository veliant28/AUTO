import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export function usePartDetail(article: string | null) {
  return useQuery({
    queryKey: ['part-detail', article],
    queryFn: async () => {
      if (!article) return null;
      const { data } = await api.get(`/catalog/parts/${article}/details`);
      return data;
    },
    enabled: !!article,
  });
}
