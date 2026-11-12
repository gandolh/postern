// A question the composer asks before going on ("Did you mean to attach
// files?", "Discard this draft?"): a modal confirmation (Base UI's
// AlertDialog, through components/ui/Modal) with Cancel focused first. It opens inside
// the composer window when that is full screen (components/ui/Modal's layer).

import { useId } from "react";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";

export interface QuestionProps {
  title: string;
  body: string;
  confirmLabel: string;
  /** Discard is destructive (red); Send is not. */
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function Question({ title, body, confirmLabel, tone = "primary", onConfirm, onCancel }: QuestionProps) {
  const id = useId();

  return (
    <Modal
      alert
      className="max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-6 text-text shadow-lg"
      describedBy={`${id}-body`}
      onClose={onCancel}
      onKeyDown={(event) => {
        // Keep Escape here: the composer window around it would close too.
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <Modal.Title className="text-xl">{title}</Modal.Title>
      <p id={`${id}-body`} className="mt-3 text-text-muted">
        {body}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" data-autofocus onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
