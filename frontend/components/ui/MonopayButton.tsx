'use client'

import React, { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/api'

interface MonopayConfig {
  keyId: string
  signature: string
  requestId: string
  payloadBase64: string
}

export default function MonopayButton({
  orderId,
  dark = false,
}: {
  orderId: number
  dark?: boolean
}) {
  const [config, setConfig] = useState<MonopayConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Fetch Monopay config from backend
  useEffect(() => {
    let cancelled = false
    api
      .get(`/orders/${orderId}/monopay-config`)
      .then(({ data }) => {
        if (!cancelled) setConfig(data)
      })
      .catch((err: any) => {
        if (!cancelled)
          setError(err?.response?.data?.detail || 'Monopay недоступний')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  // Load Monopay script and init widget
  useEffect(() => {
    if (!config || !containerRef.current) return

    const initWidget = () => {
      if (typeof window === 'undefined' || !(window as any).MonoPay) return

      const { button } = (window as any).MonoPay.init({
        keyId: config.keyId,
        signature: config.signature,
        requestId: config.requestId,
        payloadBase64: config.payloadBase64,
        ui: {
          buttonType: 'pay',
          theme: dark ? 'dark' : 'light',
          corners: 'rounded',
        },
        callbacks: {
          onSuccess: (result: any) => {
            console.log('Monopay success:', result)
          },
          onError: (error: any) => {
            console.error('Monopay error:', error)
          },
        },
      })

      if (containerRef.current) {
        containerRef.current.innerHTML = ''
        containerRef.current.appendChild(button)
      }
    }

    // Load script if not already loaded
    const scriptId = 'monopay-script'
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src =
        'https://pay.monobank.ua/mono-pay-button/v1/mono-pay-button.js'
      script.onload = initWidget
      script.onerror = () => setError('Не вдалося завантажити Monopay')
      document.head.appendChild(script)
    } else if ((window as any).MonoPay) {
      initWidget()
    }

    return () => {
      // Cleanup: remove button from container
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [config, dark])

  if (loading) {
    return <Skeleton className="h-12 w-64 rounded-lg" />
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  return <div ref={containerRef} className="min-h-[48px]" />
}
