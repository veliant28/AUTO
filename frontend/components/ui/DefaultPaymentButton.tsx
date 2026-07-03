'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const defaultPaymentStyles = `
  .default-payment-btn--inner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
  }
  .default-payment-btn--spinner {
    width: 24px;
    height: 24px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: default-payment-spin 0.6s linear infinite;
  }
  @keyframes default-payment-spin {
    to { transform: rotate(360deg); }
  }
`

interface DefaultPaymentButtonProps {
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
  label: string
}

export default function DefaultPaymentButton({
  onClick,
  loading = false,
  disabled = false,
  label,
}: DefaultPaymentButtonProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const styleEl = document.createElement('style')
    styleEl.textContent = defaultPaymentStyles
    document.head.appendChild(styleEl)
    return () => styleEl.remove()
  }, [])

  return (
    <Button
      className="h-[58px] min-w-[320px] w-full max-w-[320px] gap-2 overflow-visible"
      onClick={onClick}
      disabled={disabled || loading}
      type="button"
    >
      {loading ? (
        <span className="default-payment-btn--spinner" />
      ) : (
        <div
          className="default-payment-btn--inner"
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.5s ease',
          }}
        >
          <span className="font-medium text-base">{label}</span>
        </div>
      )}
    </Button>
  )
}
