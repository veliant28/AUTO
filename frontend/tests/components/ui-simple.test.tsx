import { render } from '@testing-library/react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

describe('Input', () => {
  it('renders', () => {
    const { container } = render(<Input />)
    const input = container.querySelector('input')
    expect(input).toBeInTheDocument()
  })

  it('renders with custom type', () => {
    const { container } = render(<Input type="email" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'email')
  })

  it('applies className', () => {
    const { container } = render(<Input className="test-class" />)
    expect(container.firstChild).toHaveClass('test-class')
  })

  it('forwards ref', () => {
    const ref = jest.fn()
    render(<Input ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })

  it('forwards native props', () => {
    const { container } = render(<Input placeholder="Enter text" disabled />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('placeholder', 'Enter text')
    expect(input).toBeDisabled()
  })
})

describe('Label', () => {
  it('renders children', () => {
    const { getByText } = render(<Label>Name</Label>)
    expect(getByText('Name')).toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(<Label className="custom">Label</Label>)
    expect(container.firstChild).toHaveClass('custom')
  })

  it('renders with htmlFor', () => {
    const { container } = render(<Label htmlFor="email">Email</Label>)
    expect(container.firstChild).toHaveAttribute('for', 'email')
  })
})

describe('Skeleton', () => {
  it('renders a div', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('applies className', () => {
    const { container } = render(<Skeleton className="w-10 h-10" />)
    expect(container.firstChild).toHaveClass('animate-pulse')
    expect(container.firstChild).toHaveClass('w-10')
  })
})

describe('Badge', () => {
  it('renders children', () => {
    const { getByText } = render(<Badge>New</Badge>)
    expect(getByText('New')).toBeInTheDocument()
  })

  it('applies default variant', () => {
    const { container } = render(<Badge>Default</Badge>)
    expect(container.firstChild).toHaveClass('bg-primary')
  })

  it('applies secondary variant', () => {
    const { container } = render(<Badge variant="secondary">Secondary</Badge>)
    expect(container.firstChild).toHaveClass('bg-secondary')
  })

  it('applies outline variant', () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>)
    expect(container.firstChild).toHaveClass('text-foreground')
  })
})

describe('Separator', () => {
  it('renders a separator', () => {
    const { container } = render(<Separator />)
    expect(container.firstChild).toBeInTheDocument()
  })
})
