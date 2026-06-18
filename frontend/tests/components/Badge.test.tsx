import { render } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'

describe('Badge', () => {
  it('renders children', () => {
    const { getByText } = render(<Badge>Test Badge</Badge>)
    expect(getByText('Test Badge')).toBeInTheDocument()
  })

  it('applies variant class', () => {
    const { container } = render(<Badge variant="destructive">Error</Badge>)
    expect(container.firstChild).toHaveClass('bg-destructive')
  })

  it('renders with default variant when not specified', () => {
    const { container } = render(<Badge>Default</Badge>)
    expect(container.firstChild).toHaveClass('bg-primary')
  })

  it('applies custom className', () => {
    const { container } = render(<Badge className="custom-class">Custom</Badge>)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
