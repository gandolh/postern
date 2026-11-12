// A setting that takes effect the moment it is changed, on Base UI's Switch.
// The whole row is the click target and the text names it (`role="switch"`
// with `aria-checked`); Space toggles it from the keyboard.
//
//   <Switch checked={on} onCheckedChange={setOn}>Keyboard shortcuts on</Switch>

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps, ReactNode } from "react";

export interface SwitchProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, "className" | "children"> {
  /** The label: its text names the switch. */
  children: ReactNode;
}

export function Switch({ children, ...props }: SwitchProps) {
  return (
    <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
      <BaseSwitch.Root
        {...props}
        className="inline-flex h-5 w-9 flex-none cursor-pointer items-center rounded-pill bg-border-strong p-0.5 transition-[background-color] duration-(--duration-normal) ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:bg-accent data-disabled:cursor-not-allowed data-disabled:opacity-50"
      >
        <BaseSwitch.Thumb className="size-4 rounded-full bg-surface transition-transform duration-(--duration-normal) ease-out data-checked:translate-x-4" />
      </BaseSwitch.Root>
      {children}
    </label>
  );
}
