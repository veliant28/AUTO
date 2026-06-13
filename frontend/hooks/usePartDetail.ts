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

export function useApplicabilityMakes(article: string | null) {
  return useQuery({
    queryKey: ['applicability-makes', article],
    queryFn: async () => {
      if (!article) return [];
      const { data } = await api.get(`/catalog/parts/${article}/applicability/makes`);
      return data as { id: number; name: string }[];
    },
    enabled: !!article,
    staleTime: 1000 * 60 * 30,
  });
}

export function useApplicabilityModels(article: string | null, makeId: number | null) {
  return useQuery({
    queryKey: ['applicability-models', article, makeId],
    queryFn: async () => {
      if (!article || !makeId) return [];
      const { data } = await api.get(`/catalog/parts/${article}/applicability/models`, {
        params: { make_id: makeId },
      });
      return data as { id: number; name: string }[];
    },
    enabled: !!article && !!makeId,
    staleTime: 1000 * 60 * 30,
  });
}

export function useApplicability(
  article: string | null,
  options?: {
    page?: number;
    limit?: number;
    makeId?: number | null;
    modelId?: number | null;
  },
) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 10;
  const makeId = options?.makeId;
  const modelId = options?.modelId;

  return useQuery({
    queryKey: ['applicability', article, page, limit, makeId, modelId],
    queryFn: async () => {
      if (!article) return { vehicles: [], total: 0 };
      const params: Record<string, any> = { page, limit };
      if (makeId) params.make_id = makeId;
      if (modelId) params.model_id = modelId;
      const { data } = await api.get(`/catalog/parts/${article}/applicability`, { params });
      return data as {
        vehicles: {
          mod_id: number;
          brand_name: string;
          model_name: string;
          mod_name: string;
          years: string;
        }[];
        total: number;
        page: number;
        limit: number;
      };
    },
    enabled: !!article,
  });
}
