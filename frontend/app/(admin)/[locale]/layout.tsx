import { ThemeProvider } from 'next-themes';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from 'sonner';
import { use } from 'react';
import Providers from '@/components/Providers';
import '@/app/globals.css';

export default function AdminRootLayout(props: any) {
  const { children, messages } = props;
  const params = use(props.params);
  const locale = params.locale;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <Providers>
              <Toaster position="bottom-right" offset={{ right: '48px' }} />
              {children}
            </Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
