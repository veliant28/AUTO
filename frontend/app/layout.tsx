import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoParts — интернет-магазин автозапчастей',
  description: 'Более 235 000 запчастей. Мгновенный поиск по каталогу TecDoc.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
