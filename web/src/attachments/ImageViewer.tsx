// The image preview: a modal dialog with the image in a frame sandboxed with
// nothing allowed (sandbox=""), as a srcdoc page of Postern's own holding the
// image as a data: URL under a CSP that allows nothing else. The image is
// fetched with Authorization and checked to really be a raster image by its
// bytes; its declared type is not trusted.

import { useJmap } from "../auth";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isAbortError } from "@postern/jmap";
import { IconButton } from "../shell/IconButton";
import { Modal } from "../shell/Modal";
import { VIEWER_FRAME_SANDBOX } from "../render/srcdoc";
import { fileName, imageDataUrl, saveAttachment, type AttachmentRef } from "./files";

/** The viewer's page: the image centred and fitted. `dataUrl` is base64 (A-Z a-z 0-9 + / =), safe in an attribute. */
export function viewerSrcdoc(dataUrl: string): string {
  if (!/^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=]*$/.test(dataUrl)) throw new Error("not a raster data: URL");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>html,body{margin:0;height:100%}body{display:grid;place-items:center}img{display:block;max-width:100%;max-height:100vh;object-fit:contain}</style>
</head><body><img src="${dataUrl}" alt=""></body></html>`;
}

export function ImageViewer({ part, onClose }: { part: AttachmentRef; onClose: () => void }) {
  const client = useJmap();
  const [state, setState] = useState<{ srcdoc: string | null; error: string | null }>({ srcdoc: null, error: null });
  const name = fileName(part);

  useEffect(() => {
    const abort = new AbortController();
    imageDataUrl(client, part, abort.signal).then(
      (url) => {
        if (!abort.signal.aborted) setState({ srcdoc: viewerSrcdoc(url), error: null });
      },
      (err: unknown) => {
        if (isAbortError(err)) return;
        setState({ srcdoc: null, error: err instanceof Error && err.name === "NotPreviewableError" ? err.message : "This image didn't load." });
      },
    );
    return () => abort.abort();
  }, [client, part]);

  return (
    <Modal className="att-viewer" label={`Preview of ${name}`} onClose={onClose}>
      <header className="att-viewer-bar">
        <h2 className="att-viewer-title">{name}</h2>
        <IconButton label={`Download ${name}`} icon={Download} onClick={() => void saveAttachment(client, part).catch(() => {})} />
        <IconButton label="Close preview" icon={X} onClick={onClose} tooltip="end" data-autofocus />
      </header>
      <div className="att-viewer-stage">
        {state.srcdoc ? (
          <iframe className="att-viewer-frame" sandbox={VIEWER_FRAME_SANDBOX} srcDoc={state.srcdoc} title={`Preview of ${name}`} referrerPolicy="no-referrer" />
        ) : state.error ? (
          <p className="att-viewer-note">{state.error}</p>
        ) : (
          <p className="att-viewer-note" role="status">
            Loading…
          </p>
        )}
      </div>
    </Modal>
  );
}
