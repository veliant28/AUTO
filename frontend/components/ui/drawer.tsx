"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";

const Drawer = Dialog;
const DrawerTrigger = DialogTrigger;
const DrawerClose = DialogClose;

const DrawerContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof DialogContent>
>(({ className, children, ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      'fixed z-50 flex flex-col bg-background border shadow-lg',
      'bottom-0 left-0 right-0 top-auto max-w-full',
      'rounded-t-lg',
      className,
    )}
    {...props}
  >
    <div className="mx-auto mt-3 h-1.5 w-[40px] shrink-0 rounded-full bg-muted" />
    {children}
  </DialogContent>
));
DrawerContent.displayName = "DrawerContent";

const DrawerOverlay = DialogOverlay;

export { Drawer, DrawerTrigger, DrawerClose, DrawerOverlay, DrawerContent };
