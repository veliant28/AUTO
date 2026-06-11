'use client';

import { useQueryClient } from '@tanstack/react-query';

export default function FooterHydrate({ locale, data }: { locale: string; data: Record<string, string> }) {
  const queryClient = useQueryClient();
  queryClient.setQueryData(['footer', locale], data);
  return null;
}
