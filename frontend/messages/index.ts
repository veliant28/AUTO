import enCommon from './en/common.json'
import enAdmin from './en/admin.json'
import enCatalog from './en/catalog.json'
import enHeader from './en/header.json'
import enFooter from './en/footer.json'
import enOrders from './en/orders.json'
import enCart from './en/cart.json'
import enCheckout from './en/checkout.json'
import enProfile from './en/profile.json'
import enTelegram from './en/telegram.json'
import enPages from './en/pages.json'
import enHome from './en/home.json'
import enAuth from './en/auth.json'

import ruCommon from './ru/common.json'
import ruAdmin from './ru/admin.json'
import ruCatalog from './ru/catalog.json'
import ruHeader from './ru/header.json'
import ruFooter from './ru/footer.json'
import ruOrders from './ru/orders.json'
import ruCart from './ru/cart.json'
import ruCheckout from './ru/checkout.json'
import ruProfile from './ru/profile.json'
import ruTelegram from './ru/telegram.json'
import ruPages from './ru/pages.json'
import ruHome from './ru/home.json'
import ruAuth from './ru/auth.json'

import uaCommon from './ua/common.json'
import uaAdmin from './ua/admin.json'
import uaCatalog from './ua/catalog.json'
import uaHeader from './ua/header.json'
import uaFooter from './ua/footer.json'
import uaOrders from './ua/orders.json'
import uaCart from './ua/cart.json'
import uaCheckout from './ua/checkout.json'
import uaProfile from './ua/profile.json'
import uaTelegram from './ua/telegram.json'
import uaPages from './ua/pages.json'
import uaHome from './ua/home.json'
import uaAuth from './ua/auth.json'

export const messages = {
  en: {
    common: enCommon,
    admin: enAdmin,
    catalog: enCatalog,
    header: enHeader,
    footer: enFooter,
    orders: enOrders,
    cart: enCart,
    checkout: enCheckout,
    profile: enProfile,
    telegram: enTelegram,
    pages: enPages,
    home: enHome,
    auth: enAuth,
  },
  ru: {
    common: ruCommon,
    admin: ruAdmin,
    catalog: ruCatalog,
    header: ruHeader,
    footer: ruFooter,
    orders: ruOrders,
    cart: ruCart,
    checkout: ruCheckout,
    profile: ruProfile,
    telegram: ruTelegram,
    pages: ruPages,
    home: ruHome,
    auth: ruAuth,
  },
  ua: {
    common: uaCommon,
    admin: uaAdmin,
    catalog: uaCatalog,
    header: uaHeader,
    footer: uaFooter,
    orders: uaOrders,
    cart: uaCart,
    checkout: uaCheckout,
    profile: uaProfile,
    telegram: uaTelegram,
    pages: uaPages,
    home: uaHome,
    auth: uaAuth,
  },
} as const

export type LocaleMessages = typeof messages
export type Locale = keyof LocaleMessages
