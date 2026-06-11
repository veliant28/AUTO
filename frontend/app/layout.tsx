import type { Metadata } from 'next';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const API = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://backend:8080/api/v1';
  let brandName = 'AutoParts';
  try {
    const res = await fetch(`${API}/settings`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.brand_name) brandName = data.brand_name;
    }
  } catch {}
  return {
    title: `${brandName} — интернет-магазин автозапчастей`,
    description: 'Более 235 000 запчастей. Мгновенный поиск по каталогу TecDoc.',
    icons: {
      icon: '/favicon.svg',
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
