import { render, fireEvent } from '@testing-library/react'
import StaticPage from '@/components/features/StaticPage'
import CatalogPagination from '@/components/features/CatalogPagination'

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('StaticPage', () => {
  it('renders title and children', () => {
    const { getByText } = render(
      <StaticPage title="About Us">
        <p>Some content</p>
      </StaticPage>
    )
    expect(getByText('About Us')).toBeInTheDocument()
    expect(getByText('Some content')).toBeInTheDocument()
  })
})

describe('CatalogPagination', () => {
  it('renders nothing when only one page', () => {
    const { container } = render(
      <CatalogPagination page={1} pageSize={24} total={12} onPageChange={jest.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders pagination with multiple pages', () => {
    const { getByText } = render(
      <CatalogPagination page={1} pageSize={24} total={100} onPageChange={jest.fn()} />
    )
    expect(getByText('prev_page')).toBeInTheDocument()
    expect(getByText('next_page')).toBeInTheDocument()
  })

  it('disables prev on first page', () => {
    const { getByText } = render(
      <CatalogPagination page={1} pageSize={24} total={100} onPageChange={jest.fn()} />
    )
    expect(getByText('prev_page').closest('button')).toBeDisabled()
  })

  it('disables next on last page', () => {
    const { getByText } = render(
      <CatalogPagination page={5} pageSize={24} total={100} onPageChange={jest.fn()} />
    )
    expect(getByText('next_page').closest('button')).toBeDisabled()
  })

  it('calls onPageChange when clicking next', () => {
    const onPageChange = jest.fn()
    const { getByText } = render(
      <CatalogPagination page={1} pageSize={24} total={100} onPageChange={onPageChange} />
    )
    fireEvent.click(getByText('next_page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange when clicking prev', () => {
    const onPageChange = jest.fn()
    const { getByText } = render(
      <CatalogPagination page={3} pageSize={24} total={100} onPageChange={onPageChange} />
    )
    fireEvent.click(getByText('prev_page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
