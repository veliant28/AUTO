'use client'

import React from 'react'
import { QueryClientProvider, HydrationBoundary } from '@tanstack/react-query'
import { queryClient } from '@/lib/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GoogleOAuthProvider } from '@react-oauth/google'
import type { DehydratedState } from '@tanstack/react-query'

const GOOGLE_CLIENT_ID =
  '791761831722-v8j78ko5b2annijevtdpfq1jia9e5iqv.apps.googleusercontent.com'

export default function Providers({
  children,
  dehydratedState,
}: {
  children: React.ReactNode
  dehydratedState?: DehydratedState
}) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          <TooltipProvider>{children}</TooltipProvider>
        </HydrationBoundary>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  )
}
