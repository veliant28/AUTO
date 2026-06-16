"use client";

import React from "react";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent as RadixDialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

const Drawer = Dialog;
const DrawerTrigger = DialogTrigger;
const DrawerClose = DialogClose;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof RadixDialogContent>,
  React.ComponentPropsWithoutRef<typeof RadixDialogContent>
>(({ className, children, ...props }, ref) => (
  <RadixDialogContent
    ref={ref}
    className={`bottom-0 left-0 right-0 top-auto max-w-full translate-x-0 translate-y-0 rounded-none rounded-t-lg data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom ${className || ''}`}
    aria-describedby={null}
    {...props}
  >
    <DialogTitle className="sr-only">Drawer</DialogTitle>
    <div className="mx-auto mt-3 h-1.5 w-[40px] shrink-0 rounded-full bg-muted" />
    {children}
  </RadixDialogContent>
));
DrawerContent.displayName = "DrawerContent";

export { Drawer, DrawerTrigger, DrawerPortal, DrawerClose, DrawerOverlay, DrawerContent };
