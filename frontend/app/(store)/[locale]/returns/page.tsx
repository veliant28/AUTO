import { getPageMetadata } from '@/lib/metadata'
import ReturnsClient from './ReturnsClient'

export async function generateMetadata(params: any) {
  const { locale } = await params
  return getPageMetadata('returns', locale)
}

export default function ReturnsPage() {
  return <ReturnsClient />
}
