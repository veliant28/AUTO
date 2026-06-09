'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

const DEFAULT_TZ = 'Europe/Kiev';

export function useTimezone() {
  const { data } = useQuery({
    queryKey: ['public-settings'],
    queryFn: async () => {
      const { data } = await api.get('/settings');
      return data as { brand_name: string; timezone: string };
    },
    staleTime: 60000,
  });

  return data?.timezone || DEFAULT_TZ;
}

export function formatDate(dateStr: string | null | undefined, tz?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'Z');
    if (tz) {
      return d.toLocaleString(undefined, { timeZone: tz });
    }
    return d.toLocaleString();
  } catch {
    return dateStr;
  }
}
