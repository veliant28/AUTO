import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/media/:path*',
        destination: `${process.env.INTERNAL_API_URL?.replace('/api/v1', '') || 'http://localhost:8080'}/media/:path*`,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
