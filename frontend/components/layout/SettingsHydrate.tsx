'use client';

import { useQueryClient } from '@tanstack/react-query';

export default function SettingsHydrate({ brandName }: { brandName: string }) {
  const queryClient = useQueryClient();
  queryClient.setQueryData(['public-settings'], { brand_name: brandName });
  return null;
}
