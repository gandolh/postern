// "Show original": the message's raw source (headers and MIME), fetched as
// its blob and shown as escaped text in a mono dialog, with what Stalwart's
// Authentication-Results say on top, as Gmail does.

import { isAbortError, type JmapClient } from "@postern/jmap";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useJmap } from "../auth";
import { saveAttachment } from "../attachments/files";
import { IconButton } from "../shell/IconButton";
import { Modal } from "../components/ui/Modal";
import type { ConvMessage } from "./conversationStore";
import { readAuthenticationResults } from "./people";

/** More than this is cut in the dialog; the download has it all. */
export const ORIGINAL_SHOWN_CHARS = 2_000_000;

async function fetchOriginal(client: JmapClient, message: ConvMessage, signal: AbortSignal): Promise<string> {
  const res = await client.blob.download(
    { blobId: message.blobId, name: "original.eml", type: "text/plain" },
    { signal },
  );
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
    <Modal
      className="flex max-h-[calc(100dvh-3rem)] w-[min(64rem,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-surface-raised p-0 text-text shadow-lg"
      onClose={onClose}
    >
      <header className="flex items-center gap-1 border-b border-border py-2 pr-2 pl-5">
        <Modal.Title className="flex-1 text-lg">Original message</Modal.Title>
        <IconButton
          label="Download original"
          icon={Download}
          onClick={() =>
            void saveAttachment(client, {
              blobId: message.blobId,
              name: `${subject.slice(0, 60).replace(/[\\/:*?"<>|]+/g, "_")}.eml`,
              type: "message/rfc822",
            }).catch(() => {})
          }
        />
        <IconButton label="Close" icon={X} onClick={onClose} tooltip="end" data-autofocus />
      </header>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-border px-5 py-3 text-sm [&>dd]:m-0 [&>dd]:wrap-anywhere [&>dt]:text-text-muted">
        <dt>Subject</dt>
        <dd>{subject}</dd>
        {auth ? (
          <>
            <dt>SPF</dt>
            <dd>
              {auth.spf ?? "none"}
              {auth.mailedBy ? ` (${auth.mailedBy})` : ""}
            </dd>
            <dt>DKIM</dt>
            <dd>
              {auth.dkim ?? "none"}
              {auth.signedBy ? ` (${auth.signedBy})` : ""}
            </dd>
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
        <pre
          className="m-0 min-h-48 flex-[1_1_auto] overflow-auto px-5 py-4 text-sm leading-normal wrap-anywhere whitespace-pre-wrap"
          tabIndex={0}
          aria-label="Message source"
        >
          {cut ? state.text.slice(0, ORIGINAL_SHOWN_CHARS) : state.text}
        </pre>
      ) : state.error ? (
        <p className="my-2 px-5 text-sm text-text-muted">The original didn't load.</p>
      ) : (
        <p className="my-2 px-5 text-sm text-text-muted" role="status">
          Loading…
        </p>
      )}
      {cut ? (
        <p className="my-2 px-5 text-sm text-text-muted">
          Only the start is shown. Download the original for all of it.
        </p>
      ) : null}
    </Modal>
  );
}
