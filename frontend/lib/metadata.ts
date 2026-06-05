import type { Metadata } from 'next';

type PageMeta = Record<string, Record<string, { title: string; desc: string }>>;

const meta: PageMeta = {
  catalog: {
    ru: { title: 'Каталог запчастей', desc: 'Подбор автозапчастей по марке, модели и модификации автомобиля. Огромный каталог оригинальных деталей и аналогов.' },
    en: { title: 'Parts Catalog', desc: 'Select auto parts by vehicle make, model and modification. Huge catalog of OEM and aftermarket parts.' },
    ua: { title: 'Каталог запчастин', desc: 'Підбір автозапчастин за маркою, моделлю та модифікацією автомобіля. Величезний каталог.' },
  },
  search: {
    ru: { title: 'Поиск запчастей', desc: 'Поиск автозапчастей по артикулу или названию. Быстрый подбор оригинальных деталей и аналогов.' },
    en: { title: 'Search Parts', desc: 'Search auto parts by part number or name. Fast finding of OEM and aftermarket parts.' },
    ua: { title: 'Пошук запчастин', desc: 'Пошук автозапчастин за артикулом або назвою. Швидкий підбір.' },
  },
  cart: {
    ru: { title: 'Корзина', desc: 'Ваша корзина покупок. Оформите заказ автозапчастей.' },
    en: { title: 'Shopping Cart', desc: 'Your shopping cart. Place your order for auto parts.' },
    ua: { title: 'Кошик', desc: 'Ваш кошик покупок. Оформіть замовлення автозапчастин.' },
  },
  garage: {
    ru: { title: 'Мой гараж', desc: 'Сохраненные автомобили. Быстрый подбор запчастей для вашего авто.' },
    en: { title: 'My Garage', desc: 'Saved vehicles. Quick parts lookup for your car.' },
    ua: { title: 'Мій гараж', desc: 'Збережені автомобілі. Швидкий підбір запчастин.' },
  },
  favorites: {
    ru: { title: 'Избранное', desc: 'Сохраненные запчасти. Быстрый доступ к избранным товарам.' },
    en: { title: 'Favorites', desc: 'Saved parts. Quick access to your favorite items.' },
    ua: { title: 'Обране', desc: 'Збережені запчастини. Швидкий доступ.' },
  },
  orders: {
    ru: { title: 'Мои заказы', desc: 'История заказов автозапчастей. Отслеживание статуса доставки.' },
    en: { title: 'My Orders', desc: 'Auto parts order history. Track delivery status.' },
    ua: { title: 'Мої замовлення', desc: 'Історія замовлень автозапчастин. Відстеження статусу.' },
  },
  profile: {
    ru: { title: 'Профиль', desc: 'Личный кабинет. Управление профилем и настройками.' },
    en: { title: 'Profile', desc: 'Personal account. Manage your profile and settings.' },
    ua: { title: 'Профіль', desc: 'Особистий кабінет. Керування профілем.' },
  },
  login: {
    ru: { title: 'Вход', desc: 'Войдите в личный кабинет для управления заказами и гаражом.' },
    en: { title: 'Login', desc: 'Sign in to your account to manage orders and garage.' },
    ua: { title: 'Вхід', desc: 'Увійдіть в особистий кабінет.' },
  },
  register: {
    ru: { title: 'Регистрация', desc: 'Создайте аккаунт для быстрого заказа автозапчастей.' },
    en: { title: 'Registration', desc: 'Create an account for quick auto parts ordering.' },
    ua: { title: 'Реєстрація', desc: 'Створіть акаунт для швидкого замовлення.' },
  },
  checkout: {
    ru: { title: 'Оформление заказа', desc: 'Оформление заказа автозапчастей. Укажите данные для доставки.' },
    en: { title: 'Checkout', desc: 'Place your auto parts order. Enter delivery details.' },
    ua: { title: 'Оформлення замовлення', desc: 'Оформлення замовлення автозапчастин.' },
  },
  forgotPassword: {
    ru: { title: 'Восстановление пароля', desc: 'Восстановление доступа к личному кабинету.' },
    en: { title: 'Forgot Password', desc: 'Reset your account password.' },
    ua: { title: 'Відновлення пароля', desc: 'Відновлення доступу до кабінету.' },
  },
  resetPassword: {
    ru: { title: 'Сброс пароля', desc: 'Установите новый пароль для вашего аккаунта.' },
    en: { title: 'Reset Password', desc: 'Set a new password for your account.' },
    ua: { title: 'Скидання пароля', desc: 'Встановіть новий пароль.' },
  },
  orderConfirmed: {
    ru: { title: 'Заказ оформлен', desc: 'Ваш заказ автозапчастей успешно оформлен.' },
    en: { title: 'Order Confirmed', desc: 'Your auto parts order has been placed successfully.' },
    ua: { title: 'Замовлення оформлено', desc: 'Ваше замовлення успішно оформлено.' },
  },
  admin: {
    ru: { title: 'Админ-панель', desc: 'Панель управления магазином автозапчастей.' },
    en: { title: 'Admin Panel', desc: 'Auto parts store management panel.' },
    ua: { title: 'Адмін-панель', desc: 'Панель керування магазином автозапчастин.' },
  },
};

export function getPageMetadata(page: keyof typeof meta, locale: string): Metadata {
  const m = meta[page]?.[locale] || meta[page]?.ru;
  if (!m) return {};
  return {
    title: m.title,
    description: m.desc,
    openGraph: {
      title: m.title,
      description: m.desc,
    },
  };
}
