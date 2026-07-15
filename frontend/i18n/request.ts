import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import { messages } from '../messages'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: messages[locale as keyof typeof messages],
  }
})
