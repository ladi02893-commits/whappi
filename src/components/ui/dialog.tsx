'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out fixed inset-0 z-50 bg-slate-950/55" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-3 bottom-3 z-50 max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-xl hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export const DialogTitle = ({
  className,
  ...props
}: DialogPrimitive.DialogTitleProps) => (
  <DialogPrimitive.Title
    className={cn('pr-10 text-lg font-bold', className)}
    {...props}
  />
)
export const DialogDescription = ({
  className,
  ...props
}: DialogPrimitive.DialogDescriptionProps) => (
  <DialogPrimitive.Description
    className={cn('mt-1 text-sm text-muted-foreground', className)}
    {...props}
  />
)
