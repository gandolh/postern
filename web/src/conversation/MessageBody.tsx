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
      <div className="ml-13 grid gap-2 pt-2 pb-4 @max-[40rem]/conv:ml-0" role="status" aria-label="Loading the message">
        <span className="block h-3.5 rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] group-data-[animated=false]/skel:animate-none motion-safe:animate-skeleton" />
        <span className="block h-3.5 rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] group-data-[animated=false]/skel:animate-none motion-safe:animate-skeleton" />
        <span className="block h-3.5 w-[60%] rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] group-data-[animated=false]/skel:animate-none motion-safe:animate-skeleton" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="ml-13 pb-3 @max-[40rem]/conv:ml-0">
        <p className="my-2 text-sm text-text-muted">This message didn't load.</p>
      </div>
    );
  }
  return <LoadedBody body={state.body} {...rest} />;
}

function LoadedBody({ body, ...rest }: Omit<MessageBodyProps, "state"> & { body: Body }) {
  return (
    <div className="ml-13 pb-3 @max-[40rem]/conv:ml-0">
      {body.kind === "html" ? (
        <HtmlBody body={body} {...rest} />
      ) : body.kind === "text" ? (
        <TextBody text={body.text} />
      ) : (
        <p className="my-2 text-sm text-text-muted">This message has no text.</p>
      )}
      {body.kind !== "empty" && body.truncated ? (
        <p className="my-2 text-sm text-text-muted">
          This message is too long to show in full.{" "}
          <button
            type="button"
            className="inline cursor-pointer bg-transparent p-0 font-semibold text-accent underline underline-offset-[0.15em] hover:text-accent-hover"
            onClick={rest.onShowOriginal}
          >
            Show original
          </button>
        </p>
      ) : null}
      {body.kind !== "empty" && body.encodingProblem ? (
        <p className="my-2 text-sm text-text-muted">Some characters in this message couldn't be read.</p>
      ) : null}
    </div>
  );
}

function QuoteToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="mt-2 inline-grid h-5 min-w-8 cursor-pointer place-items-center rounded-sm border border-border-strong bg-surface-sunken px-2 text-xs leading-none tracking-[0.1em] text-text-muted hover:bg-hover hover:text-text"
      aria-expanded={open}
      aria-label={open ? "Hide quoted text" : "Show quoted text"}
      data-tooltip={open ? "Hide quoted text" : "Show quoted text"}
      onClick={onToggle}
    >
      <span aria-hidden="true">•••</span>
    </button>
  );
}

function LinkWarnings({ links }: { links: readonly SuspiciousLink[] }) {
  if (links.length === 0) return null;
  const shown = links.slice(0, 3);
  return (
    <div
      className="mb-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-on-warning-soft [&>.lucide]:mt-[0.1rem] [&>.lucide]:text-inherit [&>.lucide]:[--icon-size:1.125rem]"
      role="note"
    >
      <ShieldAlert aria-hidden="true" />
      <div>
        <p className="font-semibold">Check links before you click</p>
        <ul className="mt-1 pl-4 wrap-anywhere">
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
  const clean = useMemo(
    () => sanitizeMessageHtml(body.html, { allowRemote, cidUrls: body.cidUrls }),
    [body, allowRemote],
  );
  // Whether anything was blocked is a property of the blocked rendering, so ask it even when showing.
  const blocked = useMemo(() => (allowRemote ? 0 : clean.blockedRemote), [allowRemote, clean]);

  return (
    <>
      {blocked > 0 ? (
        <div
          className="mb-3 flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 text-sm text-text [&>.lucide]:mt-[0.1rem] [&>.lucide]:text-text-muted [&>.lucide]:[--icon-size:1.125rem]"
          role="note"
        >
          <ImageOff aria-hidden="true" />
          <p>
            Images are not displayed.{" "}
            <button
              type="button"
              className="inline cursor-pointer bg-transparent p-0 font-semibold text-accent underline underline-offset-[0.15em] hover:text-accent-hover"
              onClick={onDisplayImages}
            >
              Display images below
            </button>
            {onAlwaysDisplayImages && senderAddress ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="inline cursor-pointer bg-transparent p-0 font-semibold text-accent underline underline-offset-[0.15em] hover:text-accent-hover"
                  onClick={onAlwaysDisplayImages}
                >
                  Always display images from {senderAddress}
                </button>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      {body.deferredCids.size > 0 ? (
        <div
          className="mb-3 flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 text-sm text-text [&>.lucide]:mt-[0.1rem] [&>.lucide]:text-text-muted [&>.lucide]:[--icon-size:1.125rem]"
          role="note"
        >
          <ImageOff aria-hidden="true" />
          <p>
            {body.deferredCids.size === 1
              ? "One large image in this message isn't loaded"
              : `${body.deferredCids.size} images in this message aren't loaded`}{" "}
            ({formatSize(body.deferredBytes)}).{" "}
            <button
              type="button"
              className="inline cursor-pointer bg-transparent p-0 font-semibold text-accent underline underline-offset-[0.15em] hover:text-accent-hover"
              onClick={onLoadInlineImages}
            >
              Load images
            </button>
          </p>
        </div>
      ) : null}
      <LinkWarnings links={clean.suspiciousLinks} />
      <MessageFrame
        clean={clean}
        foldQuote={clean.hasQuote && !quoteOpen}
        theme={theme}
        allowRemote={allowRemote}
        title={`Message from ${senderName}`}
      />
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
      <div className="text-lg leading-normal wrap-anywhere whitespace-pre-wrap">
        <TextRuns text={split.main} />
      </div>
      {split.quote !== null ? (
        <>
          <QuoteToggle open={quoteOpen} onToggle={() => setQuoteOpen((o) => !o)} />
          {quoteOpen ? (
            <div className="mt-2 border-l-2 border-border-strong pl-3 text-lg leading-normal wrap-anywhere whitespace-pre-wrap text-text-muted">
              <TextRuns text={split.quote} />
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
