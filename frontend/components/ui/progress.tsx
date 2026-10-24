'use client'
import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.ComponentPropsWithoutRef<
  typeof ProgressPrimitive.Root
> {
  indicatorClassName?: string
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        'h-full w-full flex-1 transition-all duration-700 ease-in-out',
        indicatorClassName || 'bg-primary',
      )}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

/**
 * Progress that fills from 0 once on mount and then follows the value
 * directly, so live progress updates never replay the entrance animation.
 */
const AnimatedProgress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ value, ...props }, ref) => {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return <Progress ref={ref} value={mounted ? value : 0} {...props} />
})
AnimatedProgress.displayName = 'AnimatedProgress'

/** Count from 0 to the value once, then follow later values immediately. */
function useEntranceCountUp(target: number, durationMs: number): number {
  const [display, setDisplay] = React.useState(0)
  const settledRef = React.useRef(false)
  const targetRef = React.useRef(target)
  targetRef.current = target

  React.useEffect(() => {
    let raf = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(Math.max((now - started) / durationMs, 0), 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(eased * targetRef.current)
      setDisplay((prev) => (prev === next ? prev : next))
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        settledRef.current = true
        setDisplay(targetRef.current)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [durationMs])

  React.useEffect(() => {
    if (settledRef.current) setDisplay(target)
  }, [target])

  return display
}

/** Percentage label that counts up on appearance and then stays live. */
export function AnimatedPercent({
  value,
  durationMs = 700,
  className,
}: {
  value: number
  durationMs?: number
  className?: string
}) {
  const display = useEntranceCountUp(value, durationMs)
  return <span className={className}>{display}%</span>
}

export { Progress, AnimatedProgress }
