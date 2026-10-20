// The files attached to a draft, with upload progress, failures and Remove.
// Inline images show here only while they upload or if they failed.

import { AlertCircle, Paperclip, X } from "lucide-react";
import { formatSize, stripBidiControls } from "../attachments/kind";
import type { ComposeSession, FileItem } from "./session";

export function AttachmentTray({ session, files, inline }: { session: ComposeSession; files: readonly FileItem[]; inline: readonly FileItem[] }) {
  const shown = [...files, ...inline.filter((f) => f.status !== "done")];
  if (shown.length === 0) return null;
  return (
    <ul className="compose-tray" aria-label="Attachments">
      {shown.map((f) => {
        const name = stripBidiControls(f.name);
        const percent = f.size > 0 ? Math.min(100, Math.round((f.loaded / f.size) * 100)) : 0;
        return (
          <li key={f.key} className="compose-file" data-status={f.status}>
            {f.status === "error" ? <AlertCircle aria-hidden="true" className="compose-file-icon" /> : <Paperclip aria-hidden="true" className="compose-file-icon" />}
            <span className="compose-file-name" title={name}>
              {name}
            </span>
            <span className="compose-file-meta">
              {f.status === "error" ? (
                <span className="compose-file-error">{f.error ?? "Upload failed."}</span>
              ) : f.status === "uploading" ? (
                <span className="compose-file-progress">
                  <progress max={100} value={percent} aria-label={`Uploading ${name}`} />
                  <span>{percent}%</span>
                </span>
              ) : (
                formatSize(f.size)
              )}
            </span>
            <button type="button" className="icon-btn compose-file-remove" aria-label={`Remove ${name}`} onClick={() => session.removeFile(f.key)}>
              <X aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
