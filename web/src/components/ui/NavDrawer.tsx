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
import "./navDrawer.css";

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
        <Drawer.Backdrop className="nav-drawer-backdrop" />
        <Drawer.Viewport className="nav-drawer-viewport">
          <Drawer.Popup
            ref={popupRef}
            className="nav-drawer-popup"
            // The first control of the navigation, not the hidden close control before it.
            initialFocus={() =>
              popupRef.current?.querySelector<HTMLElement>(".nav-drawer-content :is(button, a)") ?? true
            }
            finalFocus={() => returnFocus() ?? true}
          >
            <Drawer.Title className="visually-hidden">Navigation</Drawer.Title>
            {/* Out of sight until it has focus: the X of rule 15, for the keyboard and for screen readers. */}
            <Drawer.Close className="nav-drawer-close">Close the navigation</Drawer.Close>
            <Drawer.Content ref={contentRef} className="shell-nav-frame nav-drawer-content">
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
