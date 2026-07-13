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
    const apiBase = process.env.INTERNAL_API_URL || 'http://backend:8000/api/v1'
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBase}/:path*`,
      },
      {
        source: '/media/:path*',
        destination: `${apiBase.replace('/api/v1', '')}/media/:path*`,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
