// A question the composer asks before going on ("Did you mean to attach
// files?", "Discard this draft?"): a modal confirmation (Base UI's
// AlertDialog, through shell/Modal) with Cancel focused first. It opens inside
// the composer window when that is full screen (shell/Modal's layer).

import { useId } from "react";
import { Modal } from "../shell/Modal";

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
      className="compose-question"
      labelledBy={`${id}-title`}
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
      <h2 id={`${id}-title`} className="compose-question-title">
        {title}
      </h2>
      <p id={`${id}-body`} className="compose-question-body">
        {body}
      </p>
      <div className="compose-question-actions">
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={tone === "danger" ? "btn compose-question-danger" : "btn btn-primary"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
