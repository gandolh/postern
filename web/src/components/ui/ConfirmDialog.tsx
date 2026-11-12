// "Delete forever?": a modal confirmation (Base UI's AlertDialog, through
// components/ui/Modal), the only confirmation the list asks for (Gmail asks before
// deleting from Trash or Spam for good). Cancel takes focus first.

import { useState } from "react";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  /**
   * Runs when the confirm button is pressed. Returning a promise keeps the
   * dialog up until it settles: both buttons are disabled, Escape does nothing
   * and the confirm button says `pendingLabel`. Whoever called closes it.
   */
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
  /** The confirm button's text while `onConfirm`'s promise runs. */
  pendingLabel?: string;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  pendingLabel = "Working…",
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const confirm = () => {
    if (pending) return;
    const result = onConfirm();
    if (!result) return;
    setPending(true);
    const settle = () => setPending(false);
    result.then(settle, settle);
  };

  return (
    <Modal alert className="list-confirm" describedBy="list-confirm-body" dismissible={!pending} onClose={onCancel}>
      <Modal.Title className="list-confirm-title">{title}</Modal.Title>
      <p id="list-confirm-body" className="list-confirm-body">
        {body}
      </p>
      <div className="list-confirm-actions">
        <button type="button" className="btn" data-autofocus disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn list-confirm-danger" disabled={pending} onClick={confirm}>
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
