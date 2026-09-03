'use client'

import React from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function TimePicker({
  value,
  onChange,
  disabled,
  tooltip,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  /** Подсказка при наведении на сам пикер */
  tooltip?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [hours, minutes] = (value || '00:00').split(':')
  const hoursRef = React.useRef<HTMLDivElement>(null)
  const minutesRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        hoursRef.current
          ?.querySelector<HTMLButtonElement>('[data-selected]')
          ?.scrollIntoView({ block: 'start', behavior: 'instant' })
        minutesRef.current
          ?.querySelector<HTMLButtonElement>('[data-selected]')
          ?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
    }
  }, [open])

  const trigger = (
    <PopoverTrigger asChild disabled={disabled}>
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-24 font-normal text-center mx-auto cursor-pointer gap-1 text-base"
        disabled={disabled}
      >
        <span className="flex-1">{value || '00:00'}</span>
        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
      </Button>
    </PopoverTrigger>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <PopoverContent className="w-fit p-2" align="center" sideOffset={4}>
        <div className="flex gap-1">
          {/* Hours */}
          <div
            ref={hoursRef}
            className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {Array.from({ length: 24 }, (_, i) =>
              String(i).padStart(2, '0'),
            ).map((h) => (
              <button
                key={h}
                type="button"
                data-selected={h === hours || undefined}
                className={`px-3 py-1 text-sm rounded-md cursor-pointer transition-colors ${
                  h === hours
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-accent text-foreground'
                }`}
                onClick={() => {
                  onChange(`${h}:${minutes}`)
                  setOpen(false)
                }}
              >
                {h}
              </button>
            ))}
          </div>
          <div className="w-px bg-border self-stretch" />
          {/* Minutes */}
          <div
            ref={minutesRef}
            className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto pl-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {Array.from({ length: 60 }, (_, i) =>
              String(i).padStart(2, '0'),
            ).map((m) => (
              <button
                key={m}
                type="button"
                data-selected={m === minutes || undefined}
                className={`px-3 py-1 text-sm rounded-md cursor-pointer transition-colors ${
                  m === minutes
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-accent text-foreground'
                }`}
                onClick={() => {
                  onChange(`${hours}:${m}`)
                  setOpen(false)
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default TimePicker
