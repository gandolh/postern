// The phone's and the tablet's navigation panel: Base UI's Drawer from the left
// edge. A swipe to the left, a press on the backdrop, the close control or
// Escape closes it, and focus goes to the first control inside on open and back
// to `returnFocus` on close. The children are the navigation itself; the title
// ("Navigation") is read out but not drawn.
//
// The scroll container is `Drawer.Content`, which `contentRef` reaches, so the
// caller can keep the scroll position between openings.

import { Drawer } from "@base-ui/react/drawer";
import { useRef, type ReactNode, type Ref } from "react";

export interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The control focus goes back to on close: the menu button. */
  returnFocus: () => HTMLElement | null;
  /** The scrolling element's ref. */
  contentRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

export function NavDrawer({ open, onClose, returnFocus, contentRef, children }: NavDrawerProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Drawer.Root
      open={open}
      swipeDirection="left"
      onOpenChange={(next, details) => {
        // An Escape a control inside already used isn't the drawer's.
        if (next || (details.reason === "escape-key" && details.event.defaultPrevented)) return;
        onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-x-0 top-(--topbar-height) bottom-0 z-scrim bg-scrim opacity-[calc(1-var(--drawer-swipe-progress,0))] data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 motion-safe:transition-opacity motion-safe:duration-(--duration-normal) motion-safe:ease-out" />
        <Drawer.Viewport className="fixed inset-x-0 top-(--topbar-height) bottom-0 z-drawer">
          <Drawer.Popup
            ref={popupRef}
            className="flex h-full w-[calc(var(--nav-width)+1rem)] transform-[translateX(var(--drawer-swipe-movement-x,0))] flex-col rounded-tr-xl bg-canvas shadow-lg outline-none data-ending-style:transform-[translateX(-1.5rem)] data-ending-style:opacity-0 data-starting-style:transform-[translateX(-1.5rem)] data-starting-style:opacity-0 data-swiping:duration-0 data-swiping:select-none motion-safe:transition-[transform,opacity] motion-safe:duration-(--duration-normal) motion-safe:ease-out"
            // The first control of the navigation, not the hidden close control before it.
            initialFocus={() =>
              popupRef.current?.querySelector<HTMLElement>("[data-drawer-content] :is(button, a)") ?? true
            }
            finalFocus={() => returnFocus() ?? true}
          >
            <Drawer.Title className="sr-only">Navigation</Drawer.Title>
            {/* Out of sight until it has focus: the X of rule 15, for the keyboard and for screen readers. */}
            <Drawer.Close className="absolute top-1 right-1 z-above size-px overflow-hidden rounded-md bg-canvas px-2 py-1 whitespace-nowrap [clip-path:inset(50%)] focus-visible:size-auto focus-visible:overflow-visible focus-visible:[clip-path:none]">
              Close the navigation
            </Drawer.Close>
            <Drawer.Content
              ref={contentRef}
              data-drawer-content
              className="min-h-0 flex-1 touch-pan-y [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto [grid-area:nav]"
            >
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
