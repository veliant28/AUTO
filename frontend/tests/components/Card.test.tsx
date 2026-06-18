import { render } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

describe('Card', () => {
  it('renders Card with children', () => {
    const { getByText } = render(<Card>Content</Card>)
    expect(getByText('Content')).toBeInTheDocument()
  })

  it('renders Card with custom className', () => {
    const { container } = render(<Card className="custom-card">Test</Card>)
    expect(container.firstChild).toHaveClass('custom-card')
  })

  it('renders full card composition', () => {
    const { getByText } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    )
    expect(getByText('Title')).toBeInTheDocument()
    expect(getByText('Description')).toBeInTheDocument()
    expect(getByText('Body content')).toBeInTheDocument()
    expect(getByText('Footer')).toBeInTheDocument()
  })
})
