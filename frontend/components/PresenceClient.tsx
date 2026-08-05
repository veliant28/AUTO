'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { usePresenceStore } from '@/store/presenceStore'
import { initCartSync } from '@/lib/cartSync'

/**
 * Глобальный presence-клиент: держит WS /ws/presence (heartbeat 30с)
 * и включает синхронизацию корзины на сервер. UI не рисует.
 * Монтируется в layout витрины и в layout админки — так видны
 * и посетители, и сотрудники.
 */
export default function PresenceClient() {
  const t = useTranslations('cart')

  useEffect(() => {
    initCartSync(t('sync_error'))
    usePresenceStore.getState().connect()

    const onVisibility = () => {
      const state = usePresenceStore.getState()
      if (document.visibilityState === 'visible' && !state.connected) {
        state.connect()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      usePresenceStore.getState().disconnect()
    }
  }, [t])

  return null
}
