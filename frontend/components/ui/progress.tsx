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

export { Progress, AnimatedProgress }
