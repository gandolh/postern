// Brief 14 replaces this stub: the searchable keyboard-shortcut sheet.
// The shell renders it once; useHelpSheet().open() shows it.

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useHelpSheet } from "./helpSheet";
import "./keys.css";

export function HelpSheet() {
  const { isOpen, close } = useHelpSheet();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [isOpen]);

  return (
    <dialog ref={ref} className="keys-sheet" aria-labelledby="keys-sheet-title" onClose={close}>
      <div className="keys-sheet-head">
        <h2 id="keys-sheet-title">Keyboard shortcuts</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
          <X aria-hidden="true" />
        </button>
      </div>
      <p className="keys-sheet-body">
        Shortcuts are on their way. Press <kbd className="kbd">Esc</kbd> to close this.
      </p>
    </dialog>
  );
}
