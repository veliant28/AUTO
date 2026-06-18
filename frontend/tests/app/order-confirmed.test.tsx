import { render } from '@testing-library/react'
import OrderConfirmedPage from '@/app/(store)/[locale]/order-confirmed/OrderConfirmedClient'

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('id=123'),
  useRouter: () => ({ push: jest.fn() }),
}))

describe('OrderConfirmedPage', () => {
  it('renders success message', () => {
    const { getByText } = render(<OrderConfirmedPage />)
    expect(getByText('order_success')).toBeInTheDocument()
    expect(getByText('order_success_desc')).toBeInTheDocument()
  })

  it('displays order number from params', () => {
    const { getByText } = render(<OrderConfirmedPage />)
    expect(getByText(/#123/)).toBeInTheDocument()
  })

  it('renders buttons', () => {
    const { getByText } = render(<OrderConfirmedPage />)
    expect(getByText('my_orders')).toBeInTheDocument()
    expect(getByText('continue_shopping')).toBeInTheDocument()
  })
})
