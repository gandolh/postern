// "Delete forever?": a modal confirmation (Base UI's AlertDialog, through
// components/ui/Modal), the only confirmation the list asks for (Gmail asks before
// deleting from Trash or Spam for good). Cancel takes focus first.

import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

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
    <Modal
      alert
      className="max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-6 text-text shadow-lg"
      describedBy="list-confirm-body"
      dismissible={!pending}
      onClose={onCancel}
    >
      <Modal.Title className="text-xl">{title}</Modal.Title>
      <p id="list-confirm-body" className="mt-3 text-text-muted">
        {body}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" data-autofocus disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          className="border-transparent bg-danger text-surface hover:bg-danger hover:text-surface hover:brightness-92"
          disabled={pending}
          onClick={confirm}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
