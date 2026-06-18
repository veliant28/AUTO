import { render, fireEvent } from '@testing-library/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { formatPhone, phoneToApi, apiToPhone } from '@/components/ui/PhoneInput'

describe('formatPhone', () => {
  it('formats +380XXXXXXXXX', () => {
    expect(formatPhone('+380501234567')).toBe('+38 (050) 123-45-67')
  })

  it('handles short input', () => {
    expect(formatPhone('123')).toBe('+38 (023) ')
  })

  it('handles empty', () => {
    expect(formatPhone('')).toBe('')
  })
})

describe('phoneToApi', () => {
  it('strips formatting', () => {
    expect(phoneToApi('+38 (050) 123-45-67')).toBe('+380501234567')
  })

  it('handles empty', () => {
    expect(phoneToApi('')).toBe('')
  })
})

describe('apiToPhone', () => {
  it('returns value as-is', () => {
    expect(apiToPhone('+380501234567')).toBe('+380501234567')
  })

  it('handles null', () => {
    expect(apiToPhone(null)).toBe('')
  })
})

describe('Progress', () => {
  it('renders with value', () => {
    const { container } = render(<Progress value={50} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders with 0 value', () => {
    const { container } = render(<Progress value={0} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders with full value', () => {
    const { container } = render(<Progress value={100} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('applies className', () => {
    const { container } = render(<Progress value={30} className="h-2" />)
    expect(container.firstChild).toHaveClass('h-2')
  })
})

describe('RadioGroup', () => {
  it('renders options', () => {
    const { container } = render(
      <RadioGroup>
        <RadioGroupItem value="a" />
        <RadioGroupItem value="b" />
      </RadioGroup>
    )
    expect(container.querySelectorAll('button[role="radio"]')).toHaveLength(2)
  })

  it('accepts default value', () => {
    const { container } = render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" />
        <RadioGroupItem value="b" />
      </RadioGroup>
    )
    expect(container.firstChild).toBeInTheDocument()
  })
})
