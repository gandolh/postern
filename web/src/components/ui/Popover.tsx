// Base UI's Popover with the app's presets: portalled, placed `bottom` /
// `start` with a 4px gap, 8px from the window's edge. The Positioner is part of
// `Popover.Popup`, so a caller writes Root, Trigger and Popup.
//
//   <Popover.Root open={open} onOpenChange={setOpen}>
//     <Popover.Trigger aria-label="Search options">…</Popover.Trigger>
//     <Popover.Popup className="…" positionerClassName="…">…</Popover.Popup>
//   </Popover.Root>

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentProps, Ref } from "react";

type PopupProps = ComponentProps<typeof BasePopover.Popup>;
type PositionerProps = Pick<
  ComponentProps<typeof BasePopover.Positioner>,
  "anchor" | "side" | "align" | "sideOffset" | "collisionPadding"
>;

export interface PopoverPopupProps extends PopupProps, PositionerProps {
  /** The Positioner's own class. */
  positionerClassName?: string;
  /** Where the popup is portalled. Default <body>. */
  container?: ComponentProps<typeof BasePopover.Portal>["container"];
  ref?: Ref<HTMLDivElement>;
}

function PopoverPopup({
  positionerClassName,
  container,
  anchor,
  side = "bottom",
  align = "start",
  sideOffset = 4,
  collisionPadding = 8,
  ...popup
}: PopoverPopupProps) {
  return (
    <BasePopover.Portal container={container}>
      <BasePopover.Positioner
        className={positionerClassName}
        anchor={anchor}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
      >
        <BasePopover.Popup {...popup} />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export const Popover = {
  Root: BasePopover.Root,
  Trigger: BasePopover.Trigger,
  Title: BasePopover.Title,
  Popup: PopoverPopup,
};
