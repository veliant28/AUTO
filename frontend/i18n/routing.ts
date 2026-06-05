import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ru', 'en', 'ua'],
  defaultLocale: 'ru',
  localePrefix: 'always',
});
