'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const novapayStyles = `
  .novapay-btn--inner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
  }
  .novapay-btn--logo-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .novapay-btn--logo-wrapper svg path {
    fill: currentColor;
  }
  .novapay-btn--spinner {
    width: 24px;
    height: 24px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: novapay-spin 0.6s linear infinite;
  }
  @keyframes novapay-spin {
    to { transform: rotate(360deg); }
  }
`

interface NovaPayStandaloneButtonProps {
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
}

const NovaPayLogoSvg = () => (
  <svg
    width="140"
    height="38"
    viewBox="0 0 778 212"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g clipPath="url(#np-clip)">
      <path
        d="M300.202 64.3008V147.101H270.402L242.002 80.5008H240.602V147.101H222.602V81.9008H210.602V64.3008H246.202C250.102 64.3008 253.402 66.4008 255.102 70.1008L281.002 131.001H282.202V64.3008H300.202Z"
        fill="currentColor"
      />
      <path
        d="M309.602 116.101C309.602 97.7008 323.902 83.8008 343.102 83.8008C362.302 83.8008 376.802 97.7008 376.802 116.101C376.802 134.501 362.302 148.401 343.102 148.401C323.902 148.401 309.602 134.501 309.602 116.101ZM359.002 116.101C359.002 107.201 352.002 100.401 343.102 100.401C334.202 100.401 327.202 107.201 327.202 116.101C327.202 125.001 334.202 131.801 343.102 131.601C352.002 131.801 359.002 125.001 359.002 116.101Z"
        fill="currentColor"
      />
      <path
        d="M376.5 85.001H395.5L412.3 132.001H413.5L430.3 85.001H448.9L424.9 147.101H400.3L376.5 85.001Z"
        fill="currentColor"
      />
      <path
        d="M510.802 100.301V147.101H494.402V140.701H493.202C487.802 145.701 480.602 148.401 472.502 148.401C458.802 148.401 450.102 140.301 450.102 129.201C450.102 116.801 459.002 110.201 474.502 110.201H493.702V104.201C493.702 101.901 492.502 100.701 490.202 100.701H456.002V85.001H495.502C504.802 85.001 510.802 91.001 510.802 100.301ZM493.802 121.701V121.001H477.402C470.402 121.001 467.502 123.701 467.502 128.001C467.502 132.301 471.002 135.401 477.002 135.401C487.402 135.501 493.802 128.701 493.802 121.701Z"
        fill="currentColor"
      />
      <path
        d="M597.098 90.4008C597.098 106.501 585.498 116.501 567.898 116.501H543.698V147.101H524.898V64.3008H567.898C585.498 64.3008 597.098 74.5008 597.098 90.4008ZM577.898 90.6008C577.898 84.6008 573.598 80.9008 566.898 80.9008H543.698V100.601H566.898C573.498 100.601 577.898 96.8008 577.898 90.6008Z"
        fill="currentColor"
      />
      <path
        d="M660.102 100.301V147.101H643.802V140.701H642.602C637.202 145.701 630.002 148.401 621.902 148.401C608.202 148.401 599.602 140.301 599.602 129.201C599.602 116.801 608.502 110.201 624.002 110.201H643.202V104.201C643.202 101.901 642.002 100.701 639.702 100.701H605.402V85.001H644.902C654.102 85.001 660.102 91.001 660.102 100.301ZM643.102 121.701V121.001H626.802C619.802 121.001 616.902 123.701 616.902 128.001C616.902 132.301 620.402 135.401 626.402 135.401C636.702 135.501 643.102 128.701 643.102 121.701Z"
        fill="currentColor"
      />
      <path
        d="M736.998 85.001L709.698 156.601C705.998 165.901 701.798 169.801 693.598 169.801H670.798V153.901H690.498C691.698 153.901 692.598 153.501 693.398 152.201L664.398 85.001H683.398L701.398 133.001H702.898L718.998 85.001H736.998Z"
        fill="currentColor"
      />
      <path
        d="M137.403 171.3H72.4031C54.1031 171.3 39.2031 156.4 39.2031 138.1V73.1004C39.2031 54.8004 54.1031 39.9004 72.4031 39.9004H137.403C155.703 39.9004 170.603 54.8004 170.603 73.1004V138.1C170.603 156.4 155.703 171.3 137.403 171.3ZM72.4031 42.9004C55.7031 42.9004 42.2031 56.4004 42.2031 73.1004V138.1C42.2031 154.8 55.7031 168.3 72.4031 168.3H137.403C154.103 168.3 167.603 154.7 167.603 138.1V73.1004C167.603 56.4004 154.003 42.9004 137.403 42.9004H72.4031Z"
        fill="currentColor"
      />
      <path
        d="M113.7 136.6V115.9H96.1V136.6H82.7L99 152.9C102.3 156.2 107.6 156.2 110.9 152.9L127.2 136.6H113.7ZM73.9 127.8V83.3002L57.6 99.7002C54.3 103 54.3 108.3 57.6 111.6L73.9 127.8ZM96.1 74.6002V95.3002H113.7V74.6002H127.1L110.8 58.3002C107.5 55.0002 102.2 55.0002 98.9 58.3002L82.7 74.6002H96.1ZM152.3 99.7002L136 83.4002V127.9L152.3 111.6C155.5 108.2 155.5 102.9 152.3 99.7002Z"
        fill="currentColor"
      />
    </g>
    <defs>
      <clipPath id="np-clip">
        <rect width="778" height="211.3" fill="currentColor" />
      </clipPath>
    </defs>
  </svg>
)

export default function NovaPayStandaloneButton({
  onClick,
  loading = false,
  disabled = false,
}: NovaPayStandaloneButtonProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const styleEl = document.createElement('style')
    styleEl.textContent = novapayStyles
    document.head.appendChild(styleEl)
    return () => styleEl.remove()
  }, [])

  return (
    <Button
      className="h-[58px] min-w-[320px] w-full max-w-[320px] gap-2 overflow-visible bg-purple-500 text-white hover:bg-purple-600 dark:bg-purple-500 dark:text-white dark:hover:bg-purple-600"
      onClick={onClick}
      disabled={disabled || loading}
      type="button"
    >
      {loading ? (
        <span className="novapay-btn--spinner" />
      ) : (
        <div className="novapay-btn--inner">
          <div
            className="novapay-btn--logo-wrapper"
            style={{
              opacity: visible ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}
          >
            <NovaPayLogoSvg />
          </div>
        </div>
      )}
    </Button>
  )
}
