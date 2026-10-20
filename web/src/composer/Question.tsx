// A question the composer asks before going on ("Did you mean to attach
// files?", "Discard this draft?"): a modal <dialog> with Cancel focused first.

import { useEffect, useId, useRef } from "react";

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
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="compose-question"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
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
    </dialog>
  );
}
