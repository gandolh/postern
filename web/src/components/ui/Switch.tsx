// A setting that takes effect the moment it is changed, on Base UI's Switch.
// The whole row is the click target and the text names it (`role="switch"`
// with `aria-checked`); Space toggles it from the keyboard.
//
//   <Switch checked={on} onCheckedChange={setOn}>Keyboard shortcuts on</Switch>

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps, ReactNode } from "react";
import "./switch.css";

export interface SwitchProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, "className" | "children"> {
  /** The label: its text names the switch. */
  children: ReactNode;
}

export function Switch({ children, ...props }: SwitchProps) {
  return (
    <label className="settings-check">
      <BaseSwitch.Root {...props} className="ui-switch">
        <BaseSwitch.Thumb className="ui-switch-thumb" />
      </BaseSwitch.Root>
      {children}
    </label>
  );
}
