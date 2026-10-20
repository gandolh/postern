// A message's attachments as chips: name, type, size; preview for raster
// images (a sandboxed frame) and PDFs (a new tab); download for everything.
// HTML, SVG and other active documents are download-only and say so, and a
// double extension (invoice.pdf.html) or a name using bidi characters to
// reverse itself ("Invoice_\u202Efdp.exe") is called out. Names are shown in
// <bdi> with those characters taken out, so they read as they really are.

import { useJmap } from "../auth";
import type { EmailBodyPart, Id } from "@postern/jmap";
import { AlertTriangle, Download, Eye, File, FileCode, FileImage, FileText } from "lucide-react";
import { useState } from "react";
import { isQuietError } from "../actions/runner";
import { IconButton } from "../shell/IconButton";
import { useToast } from "../shell/toast";
import { fileName, MAX_PREVIEW_BYTES, openPdf, saveAttachment, type AttachmentRef } from "./files";
import { ImageViewer } from "./ImageViewer";
import { attachmentKind, doubleExtension, formatSize, hasBidiControls, stripBidiControls, typeLabel, type AttachmentKind } from "./kind";
import "./attachments.css";

export interface AttachmentListProps {
  /** The message's attachments (JMAP `attachments`). */
  parts: readonly EmailBodyPart[];
  /** Content-IDs already shown inline in the body: those parts are not listed. */
  inlineCids?: ReadonlySet<string>;
  /** For the list's accessible name: "Attachments from Bob". */
  label?: string;
}

const ICONS = { image: FileImage, pdf: FileText, active: FileCode, other: File } as const;

/** Why a chip warns, or null. Exported for tests. */
export function attachmentWarning(part: Pick<EmailBodyPart, "name" | "type">, kind: AttachmentKind = attachmentKind(part.type, part.name)): string | null {
  if (hasBidiControls(part.name)) {
    return `The name uses hidden characters that reverse its text. Its real name is ${stripBidiControls(part.name ?? "")}. Download only.`;
  }
  const double = doubleExtension(part.name);
  if (double) return `Named like a .${double.shown} file, but it is a .${double.real} file. Download only.`;
  if (kind === "active") return "Can contain active content. Download only; Postern never opens it.";
  return null;
}

/** Images and PDFs preview, unless the chip warns or an image is past MAX_PREVIEW_BYTES (download it instead). */
export function canPreview(part: Pick<EmailBodyPart, "size">, kind: AttachmentKind, warning: string | null): boolean {
  if (warning !== null) return false;
  if (kind === "image") return part.size <= MAX_PREVIEW_BYTES;
  return kind === "pdf";
}

/** The parts worth a chip: real attachments, not the inline images already in the body. */
export function listedAttachments(parts: readonly EmailBodyPart[], inlineCids?: ReadonlySet<string>): EmailBodyPart[] {
  return parts.filter((p) => {
    if (!p.blobId) return false;
    const cid = p.cid?.replace(/^<|>$/g, "");
    return !(cid && inlineCids?.has(cid));
  });
}

export function AttachmentList({ parts, inlineCids, label = "Attachments" }: AttachmentListProps) {
  const listed = listedAttachments(parts, inlineCids);
  const [viewing, setViewing] = useState<AttachmentRef | null>(null);
  if (listed.length === 0) return null;
  const total = listed.reduce((sum, p) => sum + (p.size ?? 0), 0);
  return (
    <section className="att-section" aria-label={label}>
      <h3 className="att-heading">
        {listed.length === 1 ? "One attachment" : `${listed.length} attachments`}
        <span className="att-heading-size"> · {formatSize(total)}</span>
      </h3>
      <ul className="att-list">
        {listed.map((part, i) => (
          <AttachmentChip key={`${part.blobId}-${part.partId ?? i}`} part={part} onPreviewImage={setViewing} />
        ))}
      </ul>
      {viewing ? <ImageViewer part={viewing} onClose={() => setViewing(null)} /> : null}
    </section>
  );
}

function AttachmentChip({ part, onPreviewImage }: { part: EmailBodyPart; onPreviewImage: (ref: AttachmentRef) => void }) {
  const client = useJmap();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const kind = attachmentKind(part.type, part.name);
  const ref: AttachmentRef = { blobId: part.blobId as Id, name: part.name, type: part.type };
  const name = fileName(ref);
  const warning = attachmentWarning(part, kind);
  const Icon = warning ? AlertTriangle : ICONS[kind];

  const run = async (what: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await what();
    } catch (err) {
      if (!isQuietError(err)) toast.show({ message: err instanceof Error && err.name === "NotPreviewableError" ? err.message : failure });
    } finally {
      setBusy(false);
    }
  };

  const download = () => void run(() => saveAttachment(client, ref), `Couldn't download ${name}.`);
  const preview = !canPreview(part, kind, warning)
    ? null
    : kind === "image"
      ? () => onPreviewImage(ref)
      : () => void run(() => openPdf(client, ref), `Couldn't open ${name}.`);

  return (
    <li className="att-chip" data-kind={kind} data-warning={warning ? "true" : undefined} aria-busy={busy || undefined}>
      <button type="button" className="att-main" onClick={preview ?? download} aria-label={`${preview ? "Preview" : "Download"} ${name}`}>
        <Icon aria-hidden="true" className="att-icon" />
        <span className="att-text">
          <bdi className="att-name">{name}</bdi>
          <span className="att-meta">
            {typeLabel(part.type, part.name)} · {formatSize(part.size)}
          </span>
        </span>
      </button>
      {preview ? <IconButton className="att-action" label={`Preview ${name}`} icon={Eye} onClick={preview} tooltip="end" /> : null}
      <IconButton className="att-action" label={`Download ${name}`} icon={Download} onClick={download} tooltip="end" />
      {warning ? (
        <p className="att-warning" role="note">
          {warning}
        </p>
      ) : null}
    </li>
  );
}
