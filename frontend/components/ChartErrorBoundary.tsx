'use client'

import React, { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      '[ChartErrorBoundary] Chart rendering error:',
      error,
      errorInfo,
    )
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="flex items-center justify-center h-full min-h-[200px] bg-muted/20 rounded-lg border border-dashed border-muted-foreground/30">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-sm">График временно недоступен</span>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
