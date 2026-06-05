import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';
import { STORAGE_KEYS, DEFAULT_STALE_TIME, DEFAULT_RETRY_COUNT } from '@/lib/constants';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.TOKEN) : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME,
      retry: DEFAULT_RETRY_COUNT,
    },
  },
});

export default api;
