"use client";

import React from "react";
import { Drawer as VaulDrawer } from "vaul";

const DrawerTrigger = VaulDrawer.Trigger;
const DrawerPortal = VaulDrawer.Portal;
const DrawerClose = VaulDrawer.Close;
const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay ref={ref} className="fixed inset-0 z-50 bg-black/40" {...props} />
));
DrawerOverlay.displayName = "DrawerOverlay";

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content>
>(({ className, children, ...props }, ref) => (
  <VaulDrawer.Portal>
    <DrawerOverlay />
    <VaulDrawer.Content
      ref={ref}
      className="fixed bottom-0 left-0 right-0 z-50 mx-auto mt-24 flex h-auto max-h-[80vh] flex-col rounded-t-[10px] border bg-background"
      aria-describedby={null}
      {...props}
    >
      <VaulDrawer.Title className="sr-only">Drawer</VaulDrawer.Title>
      <div className="mx-auto mt-3 h-1.5 w-[40px] shrink-0 rounded-full bg-muted" />
      {children}
    </VaulDrawer.Content>
  </VaulDrawer.Portal>
));
DrawerContent.displayName = "DrawerContent";

export { VaulDrawer, DrawerTrigger, DrawerPortal, DrawerClose, DrawerOverlay, DrawerContent };
