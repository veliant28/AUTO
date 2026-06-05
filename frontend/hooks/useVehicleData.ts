import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data } = await api.get('/catalog/makes');
      return data;
    },
  });
}

export function useModels(brandId: string | null) {
  return useQuery({
    queryKey: ['models', brandId],
    queryFn: async () => {
      if (!brandId) return [];
      const { data } = await api.get(`/catalog/models/${brandId}`);
      return data;
    },
    enabled: !!brandId,
  });
}

export function useModifications(modelId: string | null) {
  return useQuery({
    queryKey: ['modifications', modelId],
    queryFn: async () => {
      if (!modelId) return [];
      const { data } = await api.get(`/catalog/modifications/${modelId}`);
      return data;
    },
    enabled: !!modelId,
  });
}
