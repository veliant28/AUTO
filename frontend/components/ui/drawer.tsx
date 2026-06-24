"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialogContext } from "@/components/ui/dialog";

const Drawer = Dialog;
const DrawerTrigger = DialogTrigger;
const DrawerClose = DialogClose;

const DrawerContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open, onOpenChange } = useDialogContext();
  if (!open) return null;

  const portalRoot = typeof document !== "undefined" ? document.body : null;
  if (!portalRoot) return null;

  return createPortal(
    <>
      <DialogOverlay onClick={() => onOpenChange(false)} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed z-50 flex flex-col bg-background border shadow-lg",
          "bottom-0 left-0 right-0 top-auto max-w-full",
          "rounded-t-lg",
          className,
        )}
        {...props}
      >
        <DialogTitle className="sr-only">Drawer</DialogTitle>
        <div className="mx-auto mt-3 h-1.5 w-[40px] shrink-0 rounded-full bg-muted" />
        {children}
      </div>
    </>,
    portalRoot,
  );
});
DrawerContent.displayName = "DrawerContent";

const DrawerOverlay = DialogOverlay;

export { Drawer, DrawerTrigger, DrawerClose, DrawerOverlay, DrawerContent };
