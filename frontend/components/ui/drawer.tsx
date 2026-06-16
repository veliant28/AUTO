"use client";

import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogTitle,
  DialogOverlay,
} from "@/components/ui/dialog";

const Drawer = Dialog;
const DrawerTrigger = DialogTrigger;
const DrawerClose = DialogClose;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      forceMount
      className={cn(
        'fixed z-50 flex flex-col bg-background border shadow-lg',
        'bottom-0 left-0 right-0 top-auto max-w-full',
        'rounded-t-lg',
        'duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        className,
      )}
      aria-describedby={null}
      {...props}
    >
      <DialogTitle className="sr-only">Drawer</DialogTitle>
      <div className="mx-auto mt-3 h-1.5 w-[40px] shrink-0 rounded-full bg-muted" />
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DrawerContent.displayName = "DrawerContent";

export { Drawer, DrawerTrigger, DrawerClose, DrawerOverlay, DrawerContent };
