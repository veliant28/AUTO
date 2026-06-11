import { ThemeProvider } from 'next-themes';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import NotificationProvider from '@/components/NotificationProvider';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from 'sonner';
import Providers from '@/components/Providers';
import type { Metadata } from 'next';
import SettingsHydrate from '@/components/layout/SettingsHydrate';
import FooterHydrate from '@/components/layout/FooterHydrate';

export async function generateMetadata({ params }: any): Promise<Metadata> {
  const { locale } = await params;
  const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8080/api/v1';
  let brandName = 'AutoParts';
  try {
    const res = await fetch(`${API}/settings`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.brand_name) brandName = data.brand_name;
    }
  } catch {}

  const meta: Record<string, any> = {
    ru: { title: `${brandName} — интернет-магазин автозапчастей`, desc: 'Более 235 000 запчастей. Мгновенный поиск по каталогу TecDoc. Оригинальные детали и качественные аналоги.' },
    en: { title: `${brandName} — online auto parts store`, desc: 'Over 235,000 parts. Instant search via TecDoc catalog. Original parts and quality alternatives.' },
    ua: { title: `${brandName} — інтернет-магазин автозапчастин`, desc: 'Понад 235 000 запчастин. Миттєвий пошук за каталогом TecDoc. Оригінальні деталі та якісні аналоги.' },
  };
  const m = meta[locale] || meta.ru;
  return {
    title: { default: m.title, template: `%s | ${brandName}` },
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

const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8080/api/v1';

async function fetchBrandName(): Promise<string> {
  try {
    const res = await fetch(`${API}/settings`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.brand_name) return data.brand_name;
    }
  } catch {}
  return 'AutoParts';
}

async function fetchFooter(locale: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API}/footer?locale=${locale}`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const body = await res.json();
      return body?.data || {};
    }
  } catch {}
  return {};
}

export default async function RootLayout(props: any) {
  const { children, messages } = props;
  const params = await props.params;
  const locale = params.locale;
  const [brandName, footerData] = await Promise.all([fetchBrandName(), fetchFooter(locale)]);
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
              <SettingsHydrate brandName={brandName} />
              <FooterHydrate locale={locale} data={footerData} />
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
