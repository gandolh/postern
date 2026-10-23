// "Show original": the message's raw source (headers and MIME), fetched as
// its blob and shown as escaped text in a mono dialog, with what Stalwart's
// Authentication-Results say on top, as Gmail does.

import { isAbortError, type JmapClient } from "@postern/jmap";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useJmap } from "../auth";
import { saveAttachment } from "../attachments/files";
import { IconButton } from "../shell/IconButton";
import { Modal } from "../shell/Modal";
import type { ConvMessage } from "./conversationStore";
import { readAuthenticationResults } from "./people";

/** More than this is cut in the dialog; the download has it all. */
export const ORIGINAL_SHOWN_CHARS = 2_000_000;

async function fetchOriginal(client: JmapClient, message: ConvMessage, signal: AbortSignal): Promise<string> {
  const res = await client.blob.download({ blobId: message.blobId, name: "original.eml", type: "text/plain" }, { signal });
  return res.text();
}

export function ShowOriginal({ message, onClose }: { message: ConvMessage; onClose: () => void }) {
  const client = useJmap();
  const [state, setState] = useState<{ text: string | null; error: boolean }>({ text: null, error: false });
  const auth = readAuthenticationResults(message.authResults);

  useEffect(() => {
    const abort = new AbortController();
    fetchOriginal(client, message, abort.signal).then(
      (text) => setState({ text, error: false }),
      (err: unknown) => {
        if (!isAbortError(err)) setState({ text: null, error: true });
      },
    );
    return () => abort.abort();
  }, [client, message]);

  const subject = message.subject || "(no subject)";
  const cut = state.text !== null && state.text.length > ORIGINAL_SHOWN_CHARS;

  return (
    <Modal className="conv-original" labelledBy="conv-original-title" onClose={onClose}>
      <header className="conv-original-bar">
        <h2 id="conv-original-title" className="conv-original-title">
          Original message
        </h2>
        <IconButton
          label="Download original"
          icon={Download}
          onClick={() => void saveAttachment(client, { blobId: message.blobId, name: `${subject.slice(0, 60).replace(/[\\/:*?"<>|]+/g, "_")}.eml`, type: "message/rfc822" }).catch(() => {})}
        />
        <IconButton label="Close" icon={X} onClick={onClose} tooltip="end" data-autofocus />
      </header>
      <dl className="conv-original-facts">
        <dt>Subject</dt>
        <dd>{subject}</dd>
        {auth ? (
          <>
            <dt>SPF</dt>
            <dd>{auth.spf ?? "none"}{auth.mailedBy ? ` (${auth.mailedBy})` : ""}</dd>
            <dt>DKIM</dt>
            <dd>{auth.dkim ?? "none"}{auth.signedBy ? ` (${auth.signedBy})` : ""}</dd>
            <dt>DMARC</dt>
            <dd>{auth.dmarc ?? "none"}</dd>
            {auth.checkedBy ? (
              <>
                <dt>Checked by</dt>
                <dd>{auth.checkedBy}</dd>
              </>
            ) : null}
          </>
        ) : (
          <>
            <dt>Authentication</dt>
            <dd>No results recorded</dd>
          </>
        )}
      </dl>
      {state.text !== null ? (
        <pre className="conv-original-source" tabIndex={0} aria-label="Message source">
          {cut ? state.text.slice(0, ORIGINAL_SHOWN_CHARS) : state.text}
        </pre>
      ) : state.error ? (
        <p className="conv-note">The original didn't load.</p>
      ) : (
        <p className="conv-note" role="status">
          Loading…
        </p>
      )}
      {cut ? <p className="conv-note">Only the start is shown. Download the original for all of it.</p> : null}
    </Modal>
  );
}
