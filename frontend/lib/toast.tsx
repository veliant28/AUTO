import { toast as sonnerToast } from 'sonner'
import { CustomToast } from '@/components/ui/CustomToast'
import type { ToastAction } from '@/components/ui/CustomToast'

/**
 * Converts any runtime value into a safe toast message string.
 *
 * FastAPI 422 validation errors arrive as `err.response.data.detail` — an
 * array of {type, loc, msg, input, ctx} objects. Passing that array to a
 * toast crashes React ("Objects are not valid as a React child"), so every
 * toast title/description is normalized before rendering.
 */
export function toMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (Array.isArray(value)) {
    return value
      .map((item) => toMessage(item))
      .filter((msg) => msg !== '')
      .join('; ')
  }
  if (value instanceof Error) return value.message
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.msg === 'string') return obj.msg
    if (typeof obj.message === 'string') return obj.message
    try {
      return JSON.stringify(obj)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export const toast = {
  success: (
    title: unknown,
    options?: { description?: unknown; action?: ToastAction },
  ) =>
    sonnerToast.custom((id) => (
      <CustomToast
        id={id}
        type="success"
        title={toMessage(title)}
        description={
          options?.description != null
            ? toMessage(options.description)
            : undefined
        }
        action={options?.action}
      />
    )),
  error: (
    title: unknown,
    options?: { description?: unknown; action?: ToastAction },
  ) =>
    sonnerToast.custom((id) => (
      <CustomToast
        id={id}
        type="error"
        title={toMessage(title)}
        description={
          options?.description != null
            ? toMessage(options.description)
            : undefined
        }
        action={options?.action}
      />
    )),
  info: (
    title: unknown,
    options?: { description?: unknown; action?: ToastAction },
  ) =>
    sonnerToast.custom((id) => (
      <CustomToast
        id={id}
        type="info"
        title={toMessage(title)}
        description={
          options?.description != null
            ? toMessage(options.description)
            : undefined
        }
        action={options?.action}
      />
    )),
  warning: (
    title: unknown,
    options?: { description?: unknown; action?: ToastAction },
  ) =>
    sonnerToast.custom((id) => (
      <CustomToast
        id={id}
        type="warning"
        title={toMessage(title)}
        description={
          options?.description != null
            ? toMessage(options.description)
            : undefined
        }
        action={options?.action}
      />
    )),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
}
