// The files attached to a draft, with upload progress, failures and Remove.
// Inline images show here only while they upload or if they failed.

import { AlertCircle, Paperclip, X } from "lucide-react";
import { iconButtonClass } from "../shell/IconButton";
import { formatSize, stripBidiControls } from "../attachments/kind";
import type { ComposeSession, FileItem } from "./session";

export function AttachmentTray({
  session,
  files,
  inline,
}: {
  session: ComposeSession;
  files: readonly FileItem[];
  inline: readonly FileItem[];
}) {
  const shown = [...files, ...inline.filter((f) => f.status !== "done")];
  if (shown.length === 0) return null;
  return (
    <ul className="m-0 flex flex-none list-none flex-col gap-1 px-4 pt-1 pb-2" aria-label="Attachments">
      {shown.map((f) => {
        const name = stripBidiControls(f.name);
        const percent = f.size > 0 ? Math.min(100, Math.round((f.loaded / f.size) * 100)) : 0;
        return (
          <li
            key={f.key}
            className="flex min-h-9 items-center gap-2 rounded-md bg-surface-sunken pr-1 pl-3 text-sm [--icon-size:1rem] data-[status=error]:bg-danger-soft"
            data-status={f.status}
          >
            {f.status === "error" ? (
              <AlertCircle
                aria-hidden="true"
                className="flex-none text-text-muted in-data-[status=error]:text-danger"
              />
            ) : (
              <Paperclip aria-hidden="true" className="flex-none text-text-muted in-data-[status=error]:text-danger" />
            )}
            <span
              className="min-w-0 flex-[1_1_auto] overflow-hidden font-medium text-ellipsis whitespace-nowrap"
              title={name}
            >
              {name}
            </span>
            <span className="flex-none text-text-muted">
              {f.status === "error" ? (
                <span className="text-danger">{f.error ?? "Upload failed."}</span>
              ) : f.status === "uploading" ? (
                <span className="inline-flex items-center gap-2 [&_progress]:w-24 [&_progress]:accent-accent">
                  <progress max={100} value={percent} aria-label={`Uploading ${name}`} />
                  <span>{percent}%</span>
                </span>
              ) : (
                formatSize(f.size)
              )}
            </span>
            <button
              type="button"
              className={iconButtonClass("size-7", false)}
              aria-label={`Remove ${name}`}
              onClick={() => session.removeFile(f.key)}
            >
              <X aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
