import { QueryClient } from '@tanstack/react-query';
import { DEFAULT_STALE_TIME, DEFAULT_RETRY_COUNT } from '@/lib/constants';
import { apiClient } from '@/lib/api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME,
      retry: DEFAULT_RETRY_COUNT,
    },
  },
});

export default apiClient;
