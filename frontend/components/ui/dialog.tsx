'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Custom Dialog component.
 *
 * Designed as a drop-in replacement for shadcn/ui's Radix UI Dialog.
 * Uses plain React + createPortal instead of @radix-ui/react-dialog to
 * avoid the infinite-render loop in @radix-ui/react-focus-scope with React 19.
 */

// ── Context ──────────────────────────────────────────────────────────────

interface DialogContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  onOpenChange: () => {},
})

// ── Root ─────────────────────────────────────────────────────────────────

function Dialog({
  open: openProp,
  onOpenChange: onOpenChangeProp,
  children,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = openProp !== undefined ? openProp : internalOpen
  const onOpenChange = onOpenChangeProp ?? setInternalOpen
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  )
}

// ── Trigger ──────────────────────────────────────────────────────────────

function DialogTrigger({ asChild, children, ...props }: React.ComponentProps<'button'> & { asChild?: boolean }) {
  const { onOpenChange } = React.useContext(DialogContext)
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: () => onOpenChange(true),
      ...props,
    })
  }
  return (
    <button type="button" onClick={() => onOpenChange(true)} {...props}>
      {children}
    </button>
  )
}

// ── Close ────────────────────────────────────────────────────────────────

function DialogClose({ children, ...props }: React.ComponentProps<'button'>) {
  const { onOpenChange } = React.useContext(DialogContext)
  return (
    <button type="button" onClick={() => onOpenChange(false)} {...props}>
      {children}
    </button>
  )
}

// ── Portal ───────────────────────────────────────────────────────────────

function DialogPortal({ children }: { children: React.ReactNode }) {
  const { open } = React.useContext(DialogContext)
  if (!open) return null

  const portalRoot = typeof document !== 'undefined' ? document.body : null
  if (!portalRoot) return null

  return createPortal(children, portalRoot)
}

// ── Overlay ──────────────────────────────────────────────────────────────

function DialogOverlay({ className, ...props }: React.ComponentProps<'div'>) {
  const { open, onOpenChange } = React.useContext(DialogContext)
  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm',
        className,
      )}
      onClick={() => onOpenChange(false)}
      {...props}
    />
  )
}

// ── Content ──────────────────────────────────────────────────────────────

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    hideClose?: boolean
    /** Called when the dialog should close (Escape / click outside) */
    onEscapeKeyDown?: (e: KeyboardEvent) => void
    onInteractOutside?: () => void
  }
>(
  (
    {
      className,
      children,
      hideClose,
      onEscapeKeyDown,
      onInteractOutside,
      ...props
    },
    ref,
  ) => {
    const { open, onOpenChange } = React.useContext(DialogContext)

    React.useEffect(() => {
      if (!open) return

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (onEscapeKeyDown) {
            onEscapeKeyDown(e)
          } else {
            onOpenChange(false)
          }
        }
      }

      document.addEventListener('keydown', handleKey)
      // Prevent body scroll while open
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      return () => {
        document.removeEventListener('keydown', handleKey)
        document.body.style.overflow = prev
      }
    }, [open, onOpenChange, onEscapeKeyDown])

    if (!open) return null

    return (
      <DialogPortal>
        <DialogOverlay
          onClick={() => {
            if (onInteractOutside) {
              onInteractOutside()
            } else {
              onOpenChange(false)
            }
          }}
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className={cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
            className,
          )}
          {...props}
        >
          {children}
          {!hideClose && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          )}
        </div>
      </DialogPortal>
    )
  },
)
DialogContent.displayName = 'DialogContent'

// ── Header ───────────────────────────────────────────────────────────────

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left',
        className,
      )}
      {...props}
    />
  )
}
DialogHeader.displayName = 'DialogHeader'

// ── Title ────────────────────────────────────────────────────────────────

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentProps<'h2'>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className,
    )}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

// ── Description ──────────────────────────────────────────────────────────

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<'p'>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'

// ── Footer ───────────────────────────────────────────────────────────────

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        className,
      )}
      {...props}
    />
  )
}
DialogFooter.displayName = 'DialogFooter'

// ── Exports ──────────────────────────────────────────────────────────────

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
}
