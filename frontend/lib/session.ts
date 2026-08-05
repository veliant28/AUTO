import { STORAGE_KEYS } from '@/lib/constants'

/**
 * Анонимная идентичность посетителя: UUID в localStorage.
 * Используется для presence (WS), просмотров товаров и синхронизации
 * корзины — без кук, без изменений CORS.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(STORAGE_KEYS.SESSION)
  if (!id || id.length > 64) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEYS.SESSION, id)
  }
  return id
}
