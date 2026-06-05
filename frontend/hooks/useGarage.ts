import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export function useGarage() {
  const queryClient = useQueryClient();

  const garageQuery = useQuery({
    queryKey: ['garage'],
    queryFn: async () => {
      const { data } = await api.get('/users/garage');
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (modId: number) => {
      await api.post('/users/garage/add', { mod_id: modId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['garage'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (entryId: number) => {
      await api.delete(`/users/garage/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['garage'] });
    },
  });

  return {
    garage: garageQuery.data || [],
    isLoading: garageQuery.isLoading,
    addToGarage: addMutation.mutate,
    removeFromGarage: removeMutation.mutate,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
