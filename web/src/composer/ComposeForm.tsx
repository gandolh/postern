// What every composer shows, docked, full screen or inline: From, To / Cc /
// Bcc, Subject (not inline), the body, the attachment tray and the footer with
// Send. Send checks first (recipients, uploads, the "attached" warning, an
// empty message) and asks before going on, as Gmail does.

import { mentionsAttachment } from "@postern/jmap";
import { Ellipsis, ExternalLink, Image as ImageIcon, MoreVertical, Paperclip, Trash2, Type } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "../shell/IconButton";
import { useComposerStore } from "./compose";
import { Editor } from "./editor/Editor";
import { AttachmentTray } from "./AttachmentTray";
import { Question } from "./Question";
import { RecipientInput, type RecipientInputHandle } from "./RecipientInput";
import type { ComposeSession, ComposeSnapshot } from "./session";

type Ask = "attachment" | "empty" | "discard" | "plain";

export interface ComposeFormProps {
  session: ComposeSession;
  state: ComposeSnapshot;
  variant: "window" | "inline";
  /** Inline only: move the reply into a docked window. */
  onPopOut?: () => void;
}

function saveLabel(state: ComposeSnapshot): string {
  switch (state.save) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return state.saveError ?? "Couldn't save the draft.";
    default:
      return "";
  }
}

export function ComposeForm({ session, state, variant, onPopOut }: ComposeFormProps) {
  const store = useComposerStore();
  const id = useId();
  const toRef = useRef<RecipientInputHandle>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [toolbar, setToolbar] = useState(true);
  const [menu, setMenu] = useState(false);
  const [question, setQuestion] = useState<Ask | null>(null);

  // Focus requests from the store (opened, undo send, a failed send).
  const focus = state.focus;
  useEffect(() => {
    if (!focus || state.status !== "ready") return;
    if (focus.target === "to") toRef.current?.focus();
    else if (focus.target === "body") {
      if (state.plain) textRef.current?.focus();
      else session.focusEditor();
    } else formRef.current?.focus();
    // Only when a new request comes in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n, state.status]);

  // ---- Send, with Gmail's checks ----------------------------------------------------------

  // Both read the session's live state: Ctrl+Enter can commit a typed address in the same keystroke.
  function check(): string | null {
    const state = session.state;
    const all = [...state.to, ...state.cc, ...state.bcc];
    const invalid = all.find((r) => !r.valid);
    if (invalid) return `“${invalid.raw || invalid.email}” isn't a valid email address. Fix it or remove it, then send.`;
    if (all.length === 0) return "Add at least one recipient.";
    if ([...state.files, ...state.inline].some((f) => f.status === "uploading")) return "Wait for the attachments to finish uploading.";
    if ([...state.files, ...state.inline].some((f) => f.status === "error")) return "Some files didn't upload. Remove them or attach them again.";
    return null;
  }

  function send(skip: Ask[] = []): void {
    const state = session.state;
    if (state.status !== "ready" || state.sending) return;
    const problem = check();
    if (problem) {
      session.setSendError(problem);
      return;
    }
    session.setSendError(null);
    if (!skip.includes("attachment") && state.files.length === 0 && mentionsAttachment(session.ownText())) {
      setQuestion("attachment");
      return;
    }
    if (!skip.includes("empty") && state.subject.trim() === "" && session.bodyIsBlank()) {
      setQuestion("empty");
      return;
    }
    void store.send(session.key);
  }

  // Ctrl+Enter from outside the window (brief 14's global key).
  useEffect(() => {
    session.onSendRequest(() => send());
    return () => session.onSendRequest(null);
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      // Let a recipient field commit what is typed first.
      setTimeout(() => send(), 0);
    }
  }

  // ---- Files -------------------------------------------------------------------------------

  function onPickFiles(event: ChangeEvent<HTMLInputElement>, inline: boolean): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    if (inline && !state.plain) {
      // Images picked for the body go in where the caret was.
      for (const file of files) session.insertImageFile(file);
    } else session.addFiles(files);
  }

  const identities = state.identities.filter((i) => i.email);
  const fromId = `${id}-from`;
  const subjectId = `${id}-subject`;
  const errorId = `${id}-error`;
  const toolbarId = `${id}-toolbar`;

  const ccBcc: ReactNode = (
    <span className="compose-row-actions">
      {!state.showCc ? (
        <button type="button" className="compose-link-btn" onClick={() => session.showField("cc")}>
          Cc
        </button>
      ) : null}
      {!state.showBcc ? (
        <button type="button" className="compose-link-btn" onClick={() => session.showField("bcc")}>
          Bcc
        </button>
      ) : null}
    </span>
  );

  const afterText = (
    <>
      {state.quote ? (
        <button type="button" className="compose-trimmed" aria-label="Show trimmed content" title="Show trimmed content" onClick={() => session.showQuote()}>
          <Ellipsis aria-hidden="true" />
        </button>
      ) : null}
      <AttachmentTray session={session} files={state.files} inline={state.inline} />
    </>
  );

  if (state.status === "loading") {
    return (
      <div className="compose-form compose-loading" role="status">
        Loading…
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div className="compose-form compose-loading" role="alert">
        {state.loadError}
        <button type="button" className="btn" onClick={() => void store.close(session.key)}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div ref={formRef} className="compose-form" tabIndex={-1} onKeyDown={onKeyDown} data-variant={variant}>
      {identities.length > 1 ? (
        <div className="compose-row">
          <label className="compose-row-label" htmlFor={fromId}>
            From
          </label>
          <select id={fromId} className="compose-select" value={state.identityId ?? ""} onChange={(e) => session.setIdentity(e.target.value)}>
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name ? `${i.name} <${i.email}>` : i.email}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <RecipientInput ref={toRef} session={session} source={store.recipients} field="to" label="To" recipients={state.to} trailing={ccBcc} />
      {state.showCc ? <RecipientInput session={session} source={store.recipients} field="cc" label="Cc" recipients={state.cc} /> : null}
      {state.showBcc ? <RecipientInput session={session} source={store.recipients} field="bcc" label="Bcc" recipients={state.bcc} /> : null}
      {variant === "window" ? (
        <div className="compose-row">
          <label className="visually-hidden" htmlFor={subjectId}>
            Subject
          </label>
          <input id={subjectId} className="compose-input compose-subject" placeholder="Subject" value={state.subject} onChange={(e) => session.setSubject(e.target.value)} />
        </div>
      ) : null}

      {state.closing ? (
        <p className="compose-notice" role="status">
          Uploading… The draft will be saved and closed when the files finish.
          <button type="button" className="compose-link-btn" onClick={() => session.setClosing(false)}>
            Keep editing
          </button>
        </p>
      ) : null}
      {state.sendError ? (
        <p id={errorId} className="compose-error" role="alert">
          {state.sendError}
        </p>
      ) : null}

      <div className="compose-body">
        {state.plain ? (
          <>
            <textarea ref={textRef} className="compose-plain" aria-label="Message body" value={state.text} onChange={(e) => session.setText(e.target.value)} spellCheck />
            {afterText}
          </>
        ) : (
          <Editor session={session} revision={state.revision} label="Message body" showToolbar={toolbar} toolbarId={toolbarId} onAttach={(files) => session.addFiles(files)}>
            {afterText}
          </Editor>
        )}
      </div>

      <div className="compose-footer">
        <button type="button" className="btn btn-primary compose-send" onClick={() => send()} aria-describedby={state.sendError ? errorId : undefined} title="Send (Ctrl+Enter)">
          Send
        </button>
        {!state.plain ? (
          <IconButton label="Formatting options" icon={Type} aria-pressed={toolbar} aria-controls={toolbarId} onClick={() => setToolbar((t) => !t)} />
        ) : null}
        <IconButton label="Attach files" icon={Paperclip} onClick={() => fileRef.current?.click()} />
        {!state.plain ? <IconButton label="Insert photo" icon={ImageIcon} onClick={() => imageRef.current?.click()} /> : null}
        <span className="compose-menu-wrap">
          <IconButton label="More options" icon={MoreVertical} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} />
          {menu ? (
            <span
              className="compose-menu"
              role="menu"
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                e.stopPropagation();
                setMenu(false);
              }}
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={state.plain}
                className="compose-menu-item"
                autoFocus
                onClick={() => {
                  setMenu(false);
                  if (state.plain) session.setPlain(false);
                  else setQuestion("plain");
                }}
              >
                Plain text mode
              </button>
            </span>
          ) : null}
        </span>
        {variant === "inline" && onPopOut ? <IconButton label="Pop out reply" icon={ExternalLink} onClick={onPopOut} /> : null}
        <span className="compose-save" role="status" aria-live="polite">
          {saveLabel(state)}
        </span>
        <IconButton label="Discard draft" icon={Trash2} tooltip="end" onClick={() => setQuestion("discard")} />
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPickFiles(e, false)} />
        <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => onPickFiles(e, true)} />
      </div>

      {question === "attachment" ? (
        <Question
          title="Did you mean to attach files?"
          body="You wrote that something is attached, but there are no files attached. Send anyway?"
          confirmLabel="Send"
          onConfirm={() => {
            setQuestion(null);
            send(["attachment"]);
          }}
          onCancel={() => setQuestion(null)}
        />
      ) : null}
      {question === "empty" ? (
        <Question
          title="Send without a subject or text?"
          body="This message has no subject and nothing in the body."
          confirmLabel="Send"
          onConfirm={() => {
            setQuestion(null);
            send(["attachment", "empty"]);
          }}
          onCancel={() => setQuestion(null)}
        />
      ) : null}
      {question === "discard" ? (
        <Question
          title="Discard this draft?"
          body="The draft will be deleted. You can't undo this."
          confirmLabel="Discard"
          tone="danger"
          onConfirm={() => {
            setQuestion(null);
            void store.discard(session.key);
          }}
          onCancel={() => setQuestion(null)}
        />
      ) : null}
      {question === "plain" ? (
        <Question
          title="Switch to plain text?"
          body="Converting this message to plain text will lose its formatting and any images in the body."
          confirmLabel="Switch"
          onConfirm={() => {
            setQuestion(null);
            session.setPlain(true);
          }}
          onCancel={() => setQuestion(null)}
        />
      ) : null}
    </div>
  );
}
