import { useCartStore } from '@/store/cartStore'
import { apiClient } from '@/lib/api/client'
import { toast } from '@/lib/toast'

let timer: ReturnType<typeof setTimeout> | null = null
let initialized = false
let errorMessage = ''

/**
 * Синхронизация корзины на сервер (полная замена) — чтобы админ видел
 * корзину клиента в «Мониторе». Debounce 1.5с после каждого изменения.
 * Ошибки не роняют корзину: повторная попытка при следующем изменении.
 */
export function initCartSync(message?: string) {
  if (message) errorMessage = message
  if (initialized) return
  initialized = true

  useCartStore.subscribe((state, prev) => {
    if (state.items === prev.items) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void syncCart(), 1500)
  })
}

async function syncCart() {
  const items = useCartStore.getState().items
  try {
    await apiClient.post('/cart/sync', {
      items: items.map((i) => ({
        part_id: i.part_id,
        quantity: i.quantity,
        supplier_offer_id: i.supplier_offer_id ?? null,
      })),
    })
  } catch {
    if (errorMessage) toast.error(errorMessage)
  }
}
