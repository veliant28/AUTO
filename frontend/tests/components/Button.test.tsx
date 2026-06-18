import { render, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('renders children', () => {
    const { getByText } = render(<Button>Click me</Button>)
    expect(getByText('Click me')).toBeInTheDocument()
  })

  it('applies default variant classes', () => {
    const { container } = render(<Button>Default</Button>)
    expect(container.firstChild).toHaveClass('bg-primary')
  })

  it('applies destructive variant', () => {
    const { container } = render(<Button variant="destructive">Delete</Button>)
    expect(container.firstChild).toHaveClass('bg-destructive')
  })

  it('applies size classes', () => {
    const { container } = render(<Button size="lg">Large</Button>)
    expect(container.firstChild).toHaveClass('h-10')
  })

  it('handles click events', () => {
    const handleClick = jest.fn()
    const { getByText } = render(<Button onClick={handleClick}>Click</Button>)
    fireEvent.click(getByText('Click'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders as button element by default', () => {
    const { container } = render(<Button>Test</Button>)
    expect(container.querySelector('button')).toBeInTheDocument()
  })

  it('is disabled when disabled prop is set', () => {
    const { container } = render(<Button disabled>Disabled</Button>)
    expect(container.firstChild).toBeDisabled()
  })

  it('applies custom className', () => {
    const { container } = render(<Button className="custom-class">Custom</Button>)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
