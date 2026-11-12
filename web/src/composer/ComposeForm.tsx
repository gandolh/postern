// What every composer shows, docked, full screen or inline: From, To / Cc /
// Bcc, Subject (not inline), the body, the attachment tray and the footer with
// Send. Send checks first (recipients, uploads, the "attached" warning, an
// empty message) and asks before going on, as Gmail does. Beside Send, when
// the server can hold a message, a menu offers Schedule send, which
// makes the same checks.

import { mentionsAttachment } from "@postern/jmap";
import {
  ChevronDown,
  Ellipsis,
  ExternalLink,
  Image as ImageIcon,
  MoreVertical,
  Paperclip,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "../shell/IconButton";
import { Menu } from "../components/ui/Menu";
import { useLayer } from "../components/ui/Modal";
import { useComposerStore } from "./compose";
import { Editor } from "./editor/Editor";
import { AttachmentTray } from "./AttachmentTray";
import { Question } from "./Question";
import { RecipientInput, type RecipientInputHandle } from "./RecipientInput";
import { ScheduleDialog } from "./ScheduleDialog";
import type { ComposeSession, ComposeSnapshot } from "./session";
import { Button, buttonClass } from "../components/ui/Button";

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
  // "More options" goes into the composer window when that is full screen (modal, in the top layer).
  const { anchor: menuAnchor, container: menuContainer } = useLayer(menu);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuChoice = useRef<(() => void) | null>(null);
  const [question, setQuestion] = useState<Ask | null>(null);
  // Schedule send: the menu beside Send, the time dialog, and the time a question is holding.
  const canSchedule = store.canSchedule;
  const [sendMenu, setSendMenu] = useState(false);
  const { anchor: sendMenuAnchor, container: sendMenuContainer } = useLayer(sendMenu);
  const sendMenuButton = useRef<HTMLButtonElement>(null);
  const sendMenuChoice = useRef<(() => void) | null>(null);
  const [picking, setPicking] = useState(false);
  const [askedAt, setAskedAt] = useState<Date | null>(null);

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
    if (invalid)
      return `“${invalid.raw || invalid.email}” isn't a valid email address. Fix it or remove it, then send.`;
    if (all.length === 0) return "Add at least one recipient.";
    if ([...state.files, ...state.inline].some((f) => f.status === "uploading"))
      return "Wait for the attachments to finish uploading.";
    if ([...state.files, ...state.inline].some((f) => f.status === "error"))
      return "Some files didn't upload. Remove them or attach them again.";
    return null;
  }

  /** Send now, or at `at` (Schedule send): the same checks and questions either way. */
  function send(skip: Ask[] = [], at: Date | null = null): void {
    const state = session.state;
    if (state.status !== "ready" || state.sending) return;
    const problem = check();
    if (problem) {
      session.setSendError(problem);
      return;
    }
    session.setSendError(null);
    if (!skip.includes("attachment") && state.files.length === 0 && mentionsAttachment(session.ownText())) {
      setAskedAt(at);
      setQuestion("attachment");
      return;
    }
    if (!skip.includes("empty") && state.subject.trim() === "" && session.bodyIsBlank()) {
      setAskedAt(at);
      setQuestion("empty");
      return;
    }
    if (at) void store.schedule(session.key, at);
    else void store.send(session.key);
  }

  // Ctrl+Enter from outside the window (the global key).
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
    <span className="flex min-h-10 flex-none items-center self-start max-sm:min-h-11">
      {!state.showCc ? (
        <button
          type="button"
          className="min-h-7 min-w-6 cursor-pointer rounded-sm bg-transparent px-2 py-1 text-md text-text-muted hover:text-text hover:underline max-sm:min-h-11 max-sm:min-w-11"
          onClick={() => session.showField("cc")}
        >
          Cc
        </button>
      ) : null}
      {!state.showBcc ? (
        <button
          type="button"
          className="min-h-7 min-w-6 cursor-pointer rounded-sm bg-transparent px-2 py-1 text-md text-text-muted hover:text-text hover:underline max-sm:min-h-11 max-sm:min-w-11"
          onClick={() => session.showField("bcc")}
        >
          Bcc
        </button>
      ) : null}
    </span>
  );

  const afterText = (
    <>
      {state.quote ? (
        <button
          type="button"
          className="mx-4 mb-2 inline-grid h-5 w-8 flex-none cursor-pointer place-items-center self-start rounded-sm border border-border bg-surface-sunken p-0 text-text-muted [--icon-size:1rem] hover:bg-hover hover:text-text"
          aria-label="Show trimmed content"
          title="Show trimmed content"
          onClick={() => session.showQuote()}
        >
          <Ellipsis aria-hidden="true" />
        </button>
      ) : null}
      <AttachmentTray session={session} files={state.files} inline={state.inline} />
    </>
  );

  if (state.status === "loading") {
    return (
      <div
        className="group/form flex min-h-0 flex-[1_1_auto] flex-col items-center gap-3 p-6 text-text-muted outline-none data-[variant=inline]:min-h-60"
        role="status"
      >
        Loading…
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div
        className="group/form flex min-h-0 flex-[1_1_auto] flex-col items-center gap-3 p-6 text-text-muted outline-none data-[variant=inline]:min-h-60"
        role="alert"
      >
        {state.loadError}
        <Button type="button" onClick={() => void store.close(session.key)}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={formRef}
      className="group/form flex min-h-0 flex-[1_1_auto] flex-col outline-none data-[variant=inline]:min-h-60"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-variant={variant}
    >
      {identities.length > 1 ? (
        <div className="relative mx-4 flex min-h-10 flex-none items-center gap-2 border-b border-border first:group-data-[variant=inline]/form:mt-1 focus-within:border-b-focus focus-within:shadow-[inset_0_-1px_0_var(--color-focus)] max-sm:min-h-11">
          <label className="flex-none text-md text-text-muted" htmlFor={fromId}>
            From
          </label>
          <select
            id={fromId}
            className="min-w-24 flex-[1_1_auto] cursor-pointer bg-transparent py-2 text-md text-text outline-none max-sm:min-h-11"
            value={state.identityId ?? ""}
            onChange={(e) => session.setIdentity(e.target.value)}
          >
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name ? `${i.name} <${i.email}>` : i.email}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <RecipientInput
        ref={toRef}
        session={session}
        source={store.recipients}
        field="to"
        label="To"
        recipients={state.to}
        trailing={ccBcc}
      />
      {state.showCc ? (
        <RecipientInput session={session} source={store.recipients} field="cc" label="Cc" recipients={state.cc} />
      ) : null}
      {state.showBcc ? (
        <RecipientInput session={session} source={store.recipients} field="bcc" label="Bcc" recipients={state.bcc} />
      ) : null}
      {variant === "window" ? (
        <div className="relative mx-4 flex min-h-10 flex-none items-center gap-2 border-b border-border first:group-data-[variant=inline]/form:mt-1 focus-within:border-b-focus focus-within:shadow-[inset_0_-1px_0_var(--color-focus)] max-sm:min-h-11">
          <label className="sr-only" htmlFor={subjectId}>
            Subject
          </label>
          <input
            id={subjectId}
            className="min-w-24 flex-[1_1_auto] bg-transparent py-2 text-md text-text outline-none placeholder:text-text-subtle max-sm:min-h-11"
            placeholder="Subject"
            value={state.subject}
            onChange={(e) => session.setSubject(e.target.value)}
          />
        </div>
      ) : null}

      {state.closing ? (
        <p
          className="mx-4 mt-2 flex flex-none flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-md text-on-warning-soft [&_button]:text-inherit [&_button]:underline"
          role="status"
        >
          Uploading… The draft will be saved and closed when the files finish.
          <button
            type="button"
            className="min-h-7 min-w-6 cursor-pointer rounded-sm bg-transparent px-2 py-1 text-md text-text-muted hover:text-text hover:underline max-sm:min-h-11 max-sm:min-w-11"
            onClick={() => session.setClosing(false)}
          >
            Keep editing
          </button>
        </p>
      ) : null}
      {state.sendError ? (
        <p
          id={errorId}
          className="mx-4 mt-2 flex-none rounded-md bg-danger-soft px-3 py-2 text-md text-danger"
          role="alert"
        >
          {state.sendError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-[1_1_auto] flex-col overflow-auto group-data-[variant=inline]/form:overflow-visible">
        {state.plain ? (
          <>
            <textarea
              ref={textRef}
              className="min-h-32 flex-[1_0_auto] resize-none bg-transparent px-4 py-3 text-lg leading-normal wrap-anywhere whitespace-pre-wrap text-text outline-none"
              aria-label="Message body"
              value={state.text}
              onChange={(e) => session.setText(e.target.value)}
              spellCheck
            />
            {afterText}
          </>
        ) : (
          <Editor
            session={session}
            revision={state.revision}
            label="Message body"
            showToolbar={toolbar}
            toolbarId={toolbarId}
            onAttach={(files) => session.addFiles(files)}
          >
            {afterText}
          </Editor>
        )}
      </div>

      <div className="flex flex-none items-center gap-1 px-3 py-2 [&_[data-slot=icon-button]]:after:top-auto [&_[data-slot=icon-button]]:after:bottom-[calc(100%+0.25rem)]">
        <span className="mr-2 inline-flex flex-none" data-split={canSchedule || undefined} ref={sendMenuAnchor}>
          <Button
            variant="primary"
            type="button"
            className="mr-0 min-h-10 rounded-pill px-6 font-semibold in-data-split:rounded-r-none in-data-split:pr-4 max-sm:min-h-11"
            onClick={() => send()}
            aria-describedby={state.sendError ? errorId : undefined}
            title="Send (Ctrl+Enter)"
          >
            Send
          </Button>
          {canSchedule ? (
            <Menu.Root modal={false} open={sendMenu} onOpenChange={setSendMenu}>
              <Menu.Trigger
                ref={sendMenuButton}
                className={buttonClass(
                  "primary",
                  "min-h-10 rounded-l-none rounded-r-pill border-l border-l-on-accent/35 py-0 pr-2 pl-1 [&_svg]:size-4.5",
                )}
                aria-label="More send options"
                title="More send options"
              >
                <ChevronDown aria-hidden="true" />
              </Menu.Trigger>
              <Menu.Popup
                container={sendMenuContainer}
                positionerClassName="z-menu"
                side="top"
                className="flex min-w-48 flex-col rounded-md border border-border bg-surface-raised py-1 shadow-md"
                onKeyDown={(e) => {
                  // Escape is the menu's: not the composer's, nor the browser's close request for its window.
                  if (e.key !== "Escape") return;
                  e.preventDefault();
                  e.stopPropagation();
                  setSendMenu(false);
                }}
                // The dialog opens once focus is back on the button, so it returns there when it closes.
                finalFocus={() => {
                  const choice = sendMenuChoice.current;
                  if (!choice) return true;
                  sendMenuChoice.current = null;
                  sendMenuButton.current?.focus();
                  choice();
                  return false;
                }}
              >
                <Menu.Item
                  className="flex cursor-pointer items-center gap-2 py-2 pr-3 pl-3 text-left text-md text-text aria-checked:pl-3 aria-checked:before:w-3 aria-checked:before:content-['✓'] data-highlighted:bg-hover data-highlighted:outline-none"
                  onClick={() => {
                    sendMenuChoice.current = () => setPicking(true);
                  }}
                >
                  Schedule send
                </Menu.Item>
              </Menu.Popup>
            </Menu.Root>
          ) : null}
        </span>
        {!state.plain ? (
          <IconButton
            label="Formatting options"
            icon={Type}
            aria-pressed={toolbar}
            aria-controls={toolbarId}
            onClick={() => setToolbar((t) => !t)}
          />
        ) : null}
        <IconButton label="Attach files" icon={Paperclip} onClick={() => fileRef.current?.click()} />
        {!state.plain ? (
          <IconButton label="Insert photo" icon={ImageIcon} onClick={() => imageRef.current?.click()} />
        ) : null}
        <span className="relative inline-flex" ref={menuAnchor}>
          <Menu.Root modal={false} open={menu} onOpenChange={setMenu}>
            <Menu.Trigger ref={menuButton} render={<IconButton label="More options" icon={MoreVertical} />} />
            <Menu.Popup
              container={menuContainer}
              positionerClassName="z-menu"
              side="top"
              className="flex min-w-48 flex-col rounded-md border border-border bg-surface-raised py-1 shadow-md"
              onKeyDown={(e) => {
                // Escape is the menu's: not the composer's, nor the browser's close request for its window.
                if (e.key !== "Escape") return;
                e.preventDefault();
                e.stopPropagation();
                setMenu(false);
              }}
              // The choice runs once focus is back on the button, so the question it may ask keeps focus.
              finalFocus={() => {
                const choice = menuChoice.current;
                if (!choice) return true;
                menuChoice.current = null;
                menuButton.current?.focus();
                choice();
                return false;
              }}
            >
              <Menu.CheckboxItem
                className="flex cursor-pointer items-center gap-2 py-2 pr-3 pl-8 text-left text-md text-text aria-checked:pl-3 aria-checked:before:w-3 aria-checked:before:content-['✓'] data-highlighted:bg-hover data-highlighted:outline-none"
                checked={state.plain}
                closeOnClick
                onClick={() => {
                  menuChoice.current = () => {
                    if (state.plain) session.setPlain(false);
                    else setQuestion("plain");
                  };
                }}
              >
                Plain text mode
              </Menu.CheckboxItem>
            </Menu.Popup>
          </Menu.Root>
        </span>
        {variant === "inline" && onPopOut ? (
          <IconButton label="Pop out reply" icon={ExternalLink} onClick={onPopOut} />
        ) : null}
        <span
          className="mr-0 ml-auto min-w-0 overflow-hidden text-sm text-ellipsis whitespace-nowrap text-text-subtle"
          role="status"
          aria-live="polite"
        >
          {saveLabel(state)}
        </span>
        <IconButton label="Discard draft" icon={Trash2} tooltip="end" onClick={() => setQuestion("discard")} />
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPickFiles(e, false)} />
        <input
          ref={imageRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => onPickFiles(e, true)}
        />
      </div>

      {question === "attachment" ? (
        <Question
          title="Did you mean to attach files?"
          body={`You wrote that something is attached, but there are no files attached. ${askedAt ? "Schedule it anyway?" : "Send anyway?"}`}
          confirmLabel={askedAt ? "Schedule" : "Send"}
          onConfirm={() => {
            setQuestion(null);
            send(["attachment"], askedAt);
          }}
          onCancel={() => setQuestion(null)}
        />
      ) : null}
      {question === "empty" ? (
        <Question
          title={askedAt ? "Schedule without a subject or text?" : "Send without a subject or text?"}
          body="This message has no subject and nothing in the body."
          confirmLabel={askedAt ? "Schedule" : "Send"}
          onConfirm={() => {
            setQuestion(null);
            send(["attachment", "empty"], askedAt);
          }}
          onCancel={() => setQuestion(null)}
        />
      ) : null}
      {picking ? (
        <ScheduleDialog
          maxMs={store.maxScheduleMs}
          onSchedule={(at) => {
            setPicking(false);
            send([], at);
          }}
          onCancel={() => setPicking(false)}
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
