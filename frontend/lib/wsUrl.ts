/**
 * Базовый адрес WebSocket-эндпоинтов.
 *
 * Выводится из адреса HTTP API (тот же NEXT_PUBLIC_API_URL, что использует
 * axios) — WS ходит на тот же бэкенд, что и обычные запросы. Единый
 * детерминированный URL без fallback-цепочек: в dev и в docker-деплое
 * (compose мапит 8000:8000) браузер обращается к бэкенду напрямую.
 */
export function wsBaseUrl(): string {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
  return apiBase.replace(/^http/, 'ws').replace(/\/+$/, '')
}
