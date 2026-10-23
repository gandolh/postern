// "Delete forever?": a modal confirmation (Base UI's AlertDialog, through
// shell/Modal), the only confirmation the list asks for (Gmail asks before
// deleting from Trash or Spam for good). Cancel takes focus first.

import { Modal } from "../shell/Modal";

export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal alert className="list-confirm" labelledBy="list-confirm-title" describedBy="list-confirm-body" onClose={onCancel}>
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
    </Modal>
  );
}
