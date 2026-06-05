import { ThemeProvider } from 'next-themes';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import NotificationProvider from '@/components/NotificationProvider';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from 'sonner';
import Providers from '@/components/Providers';
import { use } from 'react';
import type { Metadata } from 'next';

export async function generateMetadata(params: any): Promise<Metadata> {
  const { locale } = await params;
  const meta: Record<string, any> = {
    ru: { title: 'AutoParts — интернет-магазин автозапчастей', desc: 'Более 235 000 запчастей. Мгновенный поиск по каталогу TecDoc. Оригинальные детали и качественные аналоги.' },
    en: { title: 'AutoParts — online auto parts store', desc: 'Over 235,000 parts. Instant search via TecDoc catalog. Original parts and quality alternatives.' },
    ua: { title: 'AutoParts — інтернет-магазин автозапчастин', desc: 'Понад 235 000 запчастин. Миттєвий пошук за каталогом TecDoc. Оригінальні деталі та якісні аналоги.' },
  };
  const m = meta[locale] || meta.ru;
  return {
    title: { default: m.title, template: `%s | ${m.title.split('—')[0].trim()}` },
    description: m.desc,
    alternates: {
      languages: {
        'ru': '/ru',
        'en': '/en',
        'uk': '/ua',
      } as any,
    },
    openGraph: {
      title: m.title,
      description: m.desc,
      type: 'website',
      locale: locale === 'ru' ? 'ru_RU' : locale === 'ua' ? 'uk_UA' : 'en_US',
    },
  };
}

export default function RootLayout(props: any) {
  const { children, messages } = props;
  const params = use(props.params);
  const locale = params.locale;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider 
            attribute="class" 
            defaultTheme="system" 
            enableSystem
            disableTransitionOnChange
          >
            <Providers>
              <Toaster position="bottom-right" offset={{ right: '48px' }} />
              <div className="flex flex-col min-h-screen bg-background text-foreground font-sans antialiased">
              <Header />
              <main className="flex-1 pb-16 lg:pb-0">
                <NotificationProvider>
                  {children}
                </NotificationProvider>
              </main>
              <Footer />
            </div>
            </Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
