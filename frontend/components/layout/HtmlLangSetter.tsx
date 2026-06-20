'use client';

import { useLocale } from 'next-intl';
import { useEffect } from 'react';

/**
 * Client component that sets the <html lang="..."> attribute
 * based on the current next-intl locale.
 *
 * Must be rendered inside NextIntlClientProvider.
 */
export default function HtmlLangSetter() {
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
