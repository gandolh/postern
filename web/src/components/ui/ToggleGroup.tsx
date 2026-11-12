// A picker that saves on each choice (it sends or writes something), on Base
// UI's ToggleGroup, guarded: the arrow keys only move focus between the items,
// and Space, Enter or a click chooses. Pressing the chosen item again does
// nothing, so once one is chosen one stays pressed. For a choice kept on this
// device, where nothing is sent, a RadioGroup lets the arrow keys choose.

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";

export interface ToggleOption<Value extends string> {
  value: Value;
  label: ReactNode;
}

export interface ToggleGroupProps<Value extends string> {
  /** The group's accessible name. */
  label: string;
  /** What is drawn before the items, such as "Going?" (hidden from screen readers: `label` names the group). */
  heading?: ReactNode;
  headingClassName?: string;
  options: readonly ToggleOption<Value>[];
  /** The chosen one, or `null` before any choice. */
  value: Value | null;
  /** Called with a new choice only: never with the chosen one again, never with nothing. */
  onValueChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
}

export function ToggleGroup<Value extends string>({
  label,
  heading,
  headingClassName,
  options,
  value,
  onValueChange,
  disabled,
  className,
  itemClassName,
}: ToggleGroupProps<Value>) {
  return (
    <BaseToggleGroup
      aria-label={label}
      value={value === null ? [] : [value]}
      disabled={disabled}
      onValueChange={(next) => {
        // The guard: an empty list (the chosen item pressed again) is not a choice.
        const chosen = options.find((option) => option.value === next[0]);
        if (chosen && chosen.value !== value) onValueChange(chosen.value);
      }}
      className={className}
    >
      {heading ? (
        <span className={headingClassName} aria-hidden="true">
          {heading}
        </span>
      ) : null}
      {options.map((option) => (
        <Toggle key={option.value} value={option.value} className={itemClassName}>
          {option.label}
        </Toggle>
      ))}
    </BaseToggleGroup>
  );
}
