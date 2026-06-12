import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from 'sonner';
import { use } from 'react';
import Providers from '@/components/Providers';
import SettingsHydrate from '@/components/layout/SettingsHydrate';
import '@/app/globals.css';

export async function generateMetadata({ params }: any): Promise<Metadata> {
  const { locale } = await params;
  const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000/api/v1';
  let brandName = 'SVOM';
  try {
    const res = await fetch(`${API}/settings`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.brand_name) brandName = data.brand_name;
    }
  } catch {}

  return {
    title: { default: `${brandName} — Admin Panel`, template: `%s | ${brandName}` },
  };
}

const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000/api/v1';

async function fetchBrandName(): Promise<string> {
  try {
    const res = await fetch(`${API}/settings`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.brand_name) return data.brand_name;
    }
  } catch {}
  return 'SVOM';
}

export default async function AdminRootLayout(props: any) {
  const { children, messages } = props;
  const params = await props.params;
  const locale = params.locale;
  const brandName = await fetchBrandName();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <Providers>
              <SettingsHydrate brandName={brandName} />
              <Toaster position="bottom-right" offset={{ right: '48px' }} />
              {children}
            </Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
