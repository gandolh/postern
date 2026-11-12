// One choice from a few, on Base UI's RadioGroup: a <fieldset> with a legend, so
// it reads as a labelled group. Tab enters the group, and the arrow keys move
// and choose, as native radios do. For a setting kept on this device or a
// filter, where nothing is sent: a picker that saves to the server on each
// choice is a ToggleGroup.

import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { useId, type ReactNode } from "react";

export interface RadioOption<Value extends string> {
  value: Value;
  label: ReactNode;
}

export interface RadioGroupProps<Value extends string> {
  /** The group's name: drawn as its legend, and read out by screen readers. */
  legend: string;
  /** The form field name. */
  name?: string;
  options: readonly RadioOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  className?: string;
}

export function RadioGroup<Value extends string>({
  legend,
  name,
  options,
  value,
  onValueChange,
  className,
}: RadioGroupProps<Value>) {
  const legendId = useId();
  return (
    <BaseRadioGroup<Value>
      render={<fieldset />}
      aria-labelledby={legendId}
      name={name}
      value={value}
      onValueChange={onValueChange}
      className={className}
    >
      <legend id={legendId}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value}>
          <Radio.Root
            value={option.value}
            className="m-0 inline-flex size-4.5 flex-none cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:border-accent"
          >
            <Radio.Indicator className="size-2.5 rounded-full bg-accent data-unchecked:hidden" />
          </Radio.Root>
          {option.label}
        </label>
      ))}
    </BaseRadioGroup>
  );
}
