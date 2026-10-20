// A message's body: HTML in the sandboxed frame (MessageFrame), plain text
// as React text with links; the "Images are not displayed" bar; the link
// warnings; the "…" that shows and hides the trailing quote.

import { ImageOff, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { formatSize } from "../attachments/kind";
import { linkify } from "../render/linkify";
import { splitPlainQuote } from "../render/quotes";
import { sanitizeMessageHtml, type SuspiciousLink } from "../render/sanitize";
import type { BodyState, MessageBody as Body } from "./conversationStore";
import { MessageFrame } from "./MessageFrame";

export interface MessageBodyProps {
  state: BodyState | undefined;
  /** The real From address, for "Always display images from …". */
  senderAddress: string | null;
  senderName: string;
  theme: "light" | "dark";
  /** Remote images restored for this message (Display images, or the sender is on the list). */
  allowRemote: boolean;
  onDisplayImages: () => void;
  onAlwaysDisplayImages: (() => void) | null;
  onShowOriginal: () => void;
  /** Fetch the inline images left out by the per-message budget. */
  onLoadInlineImages: () => void;
}

export function MessageBody({ state, ...rest }: MessageBodyProps) {
  if (!state || state.status === "loading") {
    return (
      <div className="conv-body conv-body-loading" role="status" aria-label="Loading the message">
        <span className="skeleton conv-skeleton-line" />
        <span className="skeleton conv-skeleton-line" />
        <span className="skeleton conv-skeleton-line conv-skeleton-short" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="conv-body">
        <p className="conv-note">This message didn't load.</p>
      </div>
    );
  }
  return <LoadedBody body={state.body} {...rest} />;
}

function LoadedBody({ body, ...rest }: Omit<MessageBodyProps, "state"> & { body: Body }) {
  return (
    <div className="conv-body">
      {body.kind === "html" ? <HtmlBody body={body} {...rest} /> : body.kind === "text" ? <TextBody text={body.text} /> : <p className="conv-note">This message has no text.</p>}
      {body.kind !== "empty" && body.truncated ? (
        <p className="conv-note">
          This message is too long to show in full.{" "}
          <button type="button" className="conv-link-btn" onClick={rest.onShowOriginal}>
            Show original
          </button>
        </p>
      ) : null}
      {body.kind !== "empty" && body.encodingProblem ? <p className="conv-note">Some characters in this message couldn't be read.</p> : null}
    </div>
  );
}

function QuoteToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="conv-quote-toggle" aria-expanded={open} aria-label={open ? "Hide quoted text" : "Show quoted text"} data-tooltip={open ? "Hide quoted text" : "Show quoted text"} onClick={onToggle}>
      <span aria-hidden="true">•••</span>
    </button>
  );
}

function LinkWarnings({ links }: { links: readonly SuspiciousLink[] }) {
  if (links.length === 0) return null;
  const shown = links.slice(0, 3);
  return (
    <div className="conv-banner conv-banner-warning" role="note">
      <ShieldAlert aria-hidden="true" />
      <div>
        <p className="conv-banner-title">Check links before you click</p>
        <ul className="conv-banner-list">
          {shown.map((l, i) => (
            <li key={i}>
              {l.reason === "mismatch" ? (
                <>
                  “<bdi>{l.text.length > 80 ? `${l.text.slice(0, 77)}…` : l.text}</bdi>” goes to{" "}
                  <strong>
                    <bdi>{l.host}</bdi>
                  </strong>
                </>
              ) : (
                <>
                  A link goes to{" "}
                  <strong>
                    <bdi>{l.host}</bdi>
                  </strong>
                  , a name written to look like another
                </>
              )}
            </li>
          ))}
          {links.length > shown.length ? <li>and {links.length - shown.length} more</li> : null}
        </ul>
      </div>
    </div>
  );
}

function HtmlBody({
  body,
  senderAddress,
  senderName,
  theme,
  allowRemote,
  onDisplayImages,
  onAlwaysDisplayImages,
  onLoadInlineImages,
}: Omit<MessageBodyProps, "state" | "onShowOriginal"> & { body: Extract<Body, { kind: "html" }> }) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const clean = useMemo(() => sanitizeMessageHtml(body.html, { allowRemote, cidUrls: body.cidUrls }), [body, allowRemote]);
  // Whether anything was blocked is a property of the blocked rendering, so ask it even when showing.
  const blocked = useMemo(() => (allowRemote ? 0 : clean.blockedRemote), [allowRemote, clean]);

  return (
    <>
      {blocked > 0 ? (
        <div className="conv-banner" role="note">
          <ImageOff aria-hidden="true" />
          <p className="conv-banner-text">
            Images are not displayed.{" "}
            <button type="button" className="conv-link-btn" onClick={onDisplayImages}>
              Display images below
            </button>
            {onAlwaysDisplayImages && senderAddress ? (
              <>
                {" · "}
                <button type="button" className="conv-link-btn" onClick={onAlwaysDisplayImages}>
                  Always display images from {senderAddress}
                </button>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      {body.deferredCids.size > 0 ? (
        <div className="conv-banner" role="note">
          <ImageOff aria-hidden="true" />
          <p className="conv-banner-text">
            {body.deferredCids.size === 1 ? "One large image in this message isn't loaded" : `${body.deferredCids.size} images in this message aren't loaded`} (
            {formatSize(body.deferredBytes)}).{" "}
            <button type="button" className="conv-link-btn" onClick={onLoadInlineImages}>
              Load images
            </button>
          </p>
        </div>
      ) : null}
      <LinkWarnings links={clean.suspiciousLinks} />
      <MessageFrame clean={clean} foldQuote={clean.hasQuote && !quoteOpen} theme={theme} allowRemote={allowRemote} title={`Message from ${senderName}`} />
      {clean.hasQuote ? <QuoteToggle open={quoteOpen} onToggle={() => setQuoteOpen((o) => !o)} /> : null}
    </>
  );
}

function TextRuns({ text }: { text: string }) {
  const runs = useMemo(() => linkify(text), [text]);
  return (
    <>
      {runs.map((run, i) =>
        run.kind === "link" ? (
          <a key={i} href={run.href} target="_blank" rel="noopener noreferrer">
            {run.text}
          </a>
        ) : (
          run.text
        ),
      )}
    </>
  );
}

function TextBody({ text }: { text: string }) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const split = useMemo(() => splitPlainQuote(text), [text]);
  return (
    <>
      <div className="conv-plain">
        <TextRuns text={split.main} />
      </div>
      {split.quote !== null ? (
        <>
          <QuoteToggle open={quoteOpen} onToggle={() => setQuoteOpen((o) => !o)} />
          {quoteOpen ? (
            <div className="conv-plain conv-plain-quote">
              <TextRuns text={split.quote} />
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
