'use client';

import React from 'react';
import { QueryClientProvider, HydrationBoundary } from '@tanstack/react-query';
import { queryClient } from '@/lib/api';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { DehydratedState } from '@tanstack/react-query';

export default function Providers({ children, dehydratedState }: { children: React.ReactNode; dehydratedState?: DehydratedState }) {
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        <TooltipProvider>{children}</TooltipProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
