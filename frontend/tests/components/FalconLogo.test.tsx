import { render } from '@testing-library/react'
import FalconLogo from '@/components/ui/FalconLogo'

describe('FalconLogo', () => {
  it('renders svg element', () => {
    const { container } = render(<FalconLogo />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(<FalconLogo className="w-8 h-8" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('w-8 h-8')
  })

  it('sets fill to currentColor', () => {
    const { container } = render(<FalconLogo />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('fill', 'currentColor')
  })
})
