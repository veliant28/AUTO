import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export function useBrandName() {
  const { data } = useQuery({
    queryKey: ['public-settings'],
    queryFn: async () => {
      const { data } = await api.get('/settings');
      return data as { brand_name: string };
    },
    staleTime: 60000,
  });
  return data?.brand_name || 'AutoParts';
}
