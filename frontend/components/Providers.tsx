'use client'

import React, { useEffect, useState } from 'react'
import { QueryClientProvider, HydrationBoundary } from '@tanstack/react-query'
import { queryClient } from '@/lib/api'
import api from '@/lib/api'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GoogleOAuthProvider } from '@react-oauth/google'
import type { DehydratedState } from '@tanstack/react-query'

const FALLBACK_CLIENT_ID =
  '791761831722-v8j78ko5b2annijevtdpfq1jia9e5iqv.apps.googleusercontent.com'

export default function Providers({
  children,
  dehydratedState,
}: {
  children: React.ReactNode
  dehydratedState?: DehydratedState
}) {
  const [clientId, setClientId] = useState<string | null>(null)

  useEffect(() => {
    api
      .get('/settings/google-client-id')
      .then((res) => {
        if (res.data?.client_id) setClientId(res.data.client_id)
      })
      .catch(() => {
        // fallback to hardcoded value
      })
  }, [])

  // Use API value first, then fallback
  const effectiveClientId = clientId || FALLBACK_CLIENT_ID

  return (
    <GoogleOAuthProvider clientId={effectiveClientId}>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          <TooltipProvider>{children}</TooltipProvider>
        </HydrationBoundary>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  )
}
