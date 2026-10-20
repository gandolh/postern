// "Delete forever?": a modal <dialog>, the only confirmation the list asks
// for (Gmail asks before deleting from Trash or Spam for good).

import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

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
      className="list-confirm"
      aria-labelledby="list-confirm-title"
      aria-describedby="list-confirm-body"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="list-confirm-title" className="list-confirm-title">
        {title}
      </h2>
      <p id="list-confirm-body" className="list-confirm-body">
        {body}
      </p>
      <div className="list-confirm-actions">
        <button type="button" className="btn" data-autofocus onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn list-confirm-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
