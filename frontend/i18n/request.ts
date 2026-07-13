import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'
import fs from 'fs'
import path from 'path'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale
  }

  const messagesFile = path.join(
    process.cwd(),
    'messages',
    locale,
    'common.json',
  )
  const messages = JSON.parse(fs.readFileSync(messagesFile, 'utf-8'))

  return {
    locale,
    messages,
  }
})
