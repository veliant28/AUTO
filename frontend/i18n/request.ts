import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale
  }

  const [
    common,
    admin,
    catalog,
    header,
    footer,
    orders,
    cart,
    checkout,
    profile,
    telegram,
    pages,
    home,
    auth,
  ] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/admin.json`),
    import(`../messages/${locale}/catalog.json`),
    import(`../messages/${locale}/header.json`),
    import(`../messages/${locale}/footer.json`),
    import(`../messages/${locale}/orders.json`),
    import(`../messages/${locale}/cart.json`),
    import(`../messages/${locale}/checkout.json`),
    import(`../messages/${locale}/profile.json`),
    import(`../messages/${locale}/telegram.json`),
    import(`../messages/${locale}/pages.json`),
    import(`../messages/${locale}/home.json`),
    import(`../messages/${locale}/auth.json`),
  ])

  return {
    locale,
    messages: {
      common: common.default,
      admin: admin.default,
      catalog: catalog.default,
      header: header.default,
      footer: footer.default,
      orders: orders.default,
      cart: cart.default,
      checkout: checkout.default,
      profile: profile.default,
      telegram: telegram.default,
      pages: pages.default,
      home: home.default,
      auth: auth.default,
    },
  }
})
