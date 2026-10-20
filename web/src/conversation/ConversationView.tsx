// The open conversation, Gmail-style: the subject with its label chips, the
// messages oldest first (collapsed to a line except the unread ones and the
// newest; a long run of collapsed ones folds behind "N older messages"),
// each message's body in a sandboxed frame, and a toolbar that acts on the
// whole conversation. The shell renders it full width or in the reading pane.
//
// Every message body is hostile: HTML only ever reaches the screen through
// render/ (sanitised, then a sandboxed srcdoc frame). See render/srcdoc.ts.

import type { Id } from "@postern/jmap";
import { Archive, ArrowLeft, Inbox, MailOpen, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DRAFT, FLAGGED, labelIdsOf, SEEN, shownMessages, type Conversation, type ConversationScope, type MailboxRoles } from "../actions/conversation";
import { planEdits } from "../actions/patches";
import { planTrash } from "../actions/plans";
import { actionCopy, COPY } from "../actions/runner";
import { NOT_SPAM_COPY, planNotSpam, planReportSpam, REPORT_SPAM_COPY, REPORT_SPAM_MESSAGE_COPY } from "../actions/spam";
import { rolesFrom, useMailActions } from "../actions/useMailActions";
import { useAccount, useJmap } from "../auth";
import { useCompose, type ComposeMode } from "../composer";
import { useBlockSender } from "../filters/BlockSender";
import { filterMessagesLike } from "../filters/likeThese";
import { LabelMenu } from "../labels/LabelMenu";
import type { ResolvedLabel } from "../labels/labelsStore";
import { useLabels } from "../labels/useLabels";
import { ConfirmDialog } from "../list/ConfirmDialog";
import { chipLabels, type ChipLabel } from "../list/format";
import { requestReturnFocus } from "../list/returnFocus";
import { useImageAllowance } from "../render/allowance";
import { IconButton } from "../shell/IconButton";
import { formatRoute, navigate, withoutConversation, type MailRoute } from "../shell/router";
import { ConnectionLost, EmptyState } from "../shell/states";
import { useDisplaySettings, useTheme } from "../theme";
import type { ConversationSnapshot, ConvMessage } from "./conversationStore";
import { inlineReplySlotId, useInlineReplyRenderer } from "./inlineReply";
import { markReadOnOpen } from "./markRead";
import { MessageCard, type MessageCardActions } from "./MessageCard";
import { messageCardId, setActiveConversation, type ConversationController } from "./registry";
import { ShowOriginal } from "./ShowOriginal";
import { useConversationStore } from "./useConversationStore";
import "./conversation.css";

export interface ConversationViewProps {
  /** Where it was opened from; `route.conversationId` equals `conversationId`. */
  route: MailRoute;
  /** The JMAP Thread id. */
  conversationId: string;
  /** The label it was opened from, or null when opened from search results. */
  label: ResolvedLabel | null;
  /**
   * Opened from search results: the search's own scope (`in:trash` and
   * `in:spam` show only those messages, every other search leaves them out),
   * as the results list has it. Default "normal". A label route takes it from
   * the label instead.
   */
  scope?: ConversationScope["kind"];
}

export function ConversationView({ route, conversationId, label, scope }: ConversationViewProps) {
  const client = useJmap();
  const { store, snapshot } = useConversationStore(client, conversationId);
  const backHref = formatRoute(withoutConversation(route));
  const backLabel = label ? `Back to ${label.title}` : "Back to search results";
  const kind = label ? scopeKind(label) : (scope ?? "normal");

  if (snapshot.status === "loading") return <ConversationLoading backHref={backHref} backLabel={backLabel} />;
  if (snapshot.status === "missing") {
    return (
      <section className="conv-page" aria-labelledby="conv-subject">
        <PlaceholderHeading />
        <ConversationToolbarShell backHref={backHref} backLabel={backLabel} />
        <EmptyState title="This conversation doesn't exist">
          <p>It may have been deleted forever.</p>
          <a className="btn" href={backHref}>
            {backLabel}
          </a>
        </EmptyState>
      </section>
    );
  }
  if (snapshot.status === "error") {
    return (
      <section className="conv-page" aria-labelledby="conv-subject">
        <PlaceholderHeading />
        <ConversationToolbarShell backHref={backHref} backLabel={backLabel} />
        <ConnectionLost title="This conversation didn't load" onRetry={() => void store.refresh()}>
          <p>Something went wrong on the way. Try again in a moment.</p>
        </ConnectionLost>
      </section>
    );
  }
  return (
    <ConversationBody
      key={conversationId}
      route={route}
      label={label}
      kind={kind}
      conversationId={conversationId}
      snapshot={snapshot}
      loadBodies={(ids) => void store.loadBodies(ids)}
      loadInlineImages={(id) => void store.loadInlineImages(id)}
    />
  );
}

/** The screen while the conversation (or the labels it needs) loads. */
export function ConversationLoading({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <section className="conv-page" aria-busy="true" aria-labelledby="conv-subject">
      <PlaceholderHeading />
      <ConversationToolbarShell backHref={backHref} backLabel={backLabel} />
      <div className="conv-scroll">
        <div className="conv-loading" role="status" aria-label="Loading the conversation">
          <span className="skeleton conv-skeleton-title" />
          <span className="skeleton conv-skeleton-card" />
          <span className="skeleton conv-skeleton-card" />
        </div>
      </div>
    </section>
  );
}

/** Every state of the screen has its h1; until the subject is known, a hidden one. */
function PlaceholderHeading() {
  return (
    <h1 id="conv-subject" className="visually-hidden">
      Conversation
    </h1>
  );
}

function ConversationToolbarShell({ backHref, backLabel, children }: { backHref: string; backLabel: string; children?: ReactNode }) {
  return (
    <div className="conv-toolbar" role="toolbar" aria-label="Conversation actions">
      <IconButton label={backLabel} icon={ArrowLeft} href={backHref} tooltip="start" />
      {children}
    </div>
  );
}

/** Which messages a view shows: Trash and Spam show only theirs (actions/conversation.ts). */
function scopeKind(label: ResolvedLabel | null): ConversationScope["kind"] {
  return label?.view === "trash" ? "trash" : label?.view === "spam" ? "spam" : "normal";
}

type Item = { kind: "message"; message: ConvMessage; index: number } | { kind: "fold"; count: number; key: string };

/** Fold runs of 2+ collapsed messages between the first and the last three, as Gmail does. */
export function foldItems(messages: readonly ConvMessage[], isExpanded: (id: Id) => boolean, revealed: boolean): Item[] {
  const items: Item[] = [];
  let run: { message: ConvMessage; index: number }[] = [];
  const n = messages.length;
  const flush = () => {
    if (run.length >= 2) items.push({ kind: "fold", count: run.length, key: `fold-${run[0]?.message.id ?? ""}` });
    else for (const r of run) items.push({ kind: "message", ...r });
    run = [];
  };
  messages.forEach((message, index) => {
    const foldable = !revealed && n >= 5 && index >= 1 && index <= n - 4 && !isExpanded(message.id);
    if (foldable) {
      run.push({ message, index });
      return;
    }
    flush();
    items.push({ kind: "message", message, index });
  });
  flush();
  return items;
}

interface BodyProps {
  route: MailRoute;
  label: ResolvedLabel | null;
  /** Which messages it shows: the label's view, or the search's scope. */
  kind: ConversationScope["kind"];
  conversationId: Id;
  snapshot: ConversationSnapshot;
  loadBodies: (ids: Id[]) => void;
  loadInlineImages: (id: Id) => void;
}

function ConversationBody({ route, label, kind, conversationId, snapshot, loadBodies, loadInlineImages }: BodyProps) {
  const client = useJmap();
  const account = useAccount();
  const me = account.username;
  const labels = useLabels();
  const actions = useMailActions();
  const compose = useCompose();
  const { resolvedTheme } = useTheme();
  const { readingPane } = useDisplaySettings();
  const allowance = useImageAllowance(me);
  const renderInlineReply = useInlineReplyRenderer();
  const block = useBlockSender();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const rolesKey = JSON.stringify(rolesFrom(labels.store));
  const roles = useMemo(() => JSON.parse(rolesKey) as MailboxRoles, [rolesKey]);
  const scope = useMemo<ConversationScope>(() => ({ kind, roles }), [kind, roles]);
  const conversation = useMemo<Conversation<ConvMessage>>(() => ({ id: conversationId, messages: snapshot.messages }), [conversationId, snapshot.messages]);
  // A reply draft sits in the conversation it answers. The composer opens the
  // ones in Drafts inline under the last message (brief 08), so those are not
  // also cards here, unless nothing else is left to show. Any draft shown as a
  // card the composer leaves alone (it gets the ids through the inline slot).
  const inScope = useMemo(() => shownMessages(conversation, scope), [conversation, scope]);
  const shown = useMemo(() => {
    const drafts = roles.drafts;
    const sent = inScope.filter((m) => !(m.keywords[DRAFT] === true && drafts !== undefined && m.mailboxIds[drafts] === true));
    return sent.length > 0 ? sent : inScope;
  }, [inScope, roles.drafts]);
  // The conversation's own actions (archive, delete, spam, mark unread) leave
  // the hidden reply draft alone: the inline composer holds it, and moving it
  // would only have its next autosave bring it back.
  const acted = useMemo<Conversation<ConvMessage>>(() => {
    const hidden = new Set(inScope.filter((m) => !shown.includes(m)).map((m) => m.id));
    return hidden.size === 0 ? conversation : { id: conversationId, messages: snapshot.messages.filter((m) => !hidden.has(m.id)) };
  }, [conversation, conversationId, snapshot.messages, inScope, shown]);
  const last = shown[shown.length - 1];
  const hiddenCount = snapshot.messages.length - inScope.length;
  const backRoute = useMemo(() => withoutConversation(route), [route]);
  const goBack = useCallback(
    (removed = false) => {
      requestReturnFocus(removed === true);
      navigate(backRoute);
    },
    [backRoute],
  );

  // Open at first sight: the unread messages and the newest. Messages that arrive later open too.
  const [initial] = useState(() => ({
    ids: new Set(snapshot.messages.map((m) => m.id)),
    unread: new Set(shownMessages({ id: conversationId, messages: snapshot.messages }, { kind, roles }).filter((m) => m.keywords[SEEN] !== true).map((m) => m.id)),
  }));
  const [overrides, setOverrides] = useState<ReadonlyMap<Id, boolean>>(new Map());
  const [revealed, setRevealed] = useState(false);
  const isExpanded = useCallback(
    (id: Id) => overrides.get(id) ?? (initial.unread.has(id) || id === last?.id || !initial.ids.has(id)),
    [overrides, initial, last],
  );
  const toggle = useCallback((id: Id) => setOverrides((o) => new Map(o).set(id, !isExpanded(id))), [isExpanded]);
  const items = useMemo(() => foldItems(shown, isExpanded, revealed), [shown, isExpanded, revealed]);

  const [imagesShown, setImagesShown] = useState<ReadonlySet<Id>>(new Set());
  const [original, setOriginal] = useState<ConvMessage | null>(null);
  const [confirmForever, setConfirmForever] = useState(false);
  const [cursor, setCursor] = useState<Id | null>(null);

  // Bodies for the open messages.
  const expandedIds = shown.filter((m) => isExpanded(m.id)).map((m) => m.id);
  const expandedKey = expandedIds.join(",");
  useEffect(() => {
    if (expandedKey) loadBodies(expandedKey.split(","));
    // loadBodies is a new closure each render; the key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKey]);

  // Mark read on open, once per conversation shown.
  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    void markReadOnOpen(client, conversation, scope, () => void labels.store.sync());
  }, [client, conversation, scope, labels.store]);

  // Messages that arrive while the conversation is open show open (isExpanded),
  // so they are read too, as in Gmail: marked at once while the tab is visible,
  // else when it comes back. No undo, as on open.
  const arrivedRef = useRef(new Set<Id>());
  const arrivedKey = shown
    .filter((m) => !initial.ids.has(m.id) && m.keywords[SEEN] !== true && isExpanded(m.id))
    .map((m) => m.id)
    .join(",");
  useEffect(() => {
    if (!arrivedKey) return;
    const ids = arrivedKey.split(",");
    const mark = (): boolean => {
      if (document.visibilityState === "hidden") return false;
      const fresh = new Set(ids.filter((id) => !arrivedRef.current.has(id)));
      for (const id of fresh) arrivedRef.current.add(id);
      const messages = conversation.messages.filter((m) => fresh.has(m.id));
      if (messages.length > 0) void markReadOnOpen(client, { id: conversationId, messages }, scope, () => void labels.store.sync());
      return true;
    };
    if (mark()) return;
    const onVisible = () => {
      if (mark()) document.removeEventListener("visibilitychange", onVisible);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [arrivedKey, client, conversationId, conversation, scope, labels.store]);

  // Focus the subject when the conversation takes the whole panel (not when it opens beside the list).
  useEffect(() => {
    if (readingPane === "none") headingRef.current?.focus({ preventScroll: true });
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scopeOne = useCallback((m: ConvMessage): Conversation<ConvMessage>[] => [{ id: conversationId, messages: [m] }], [conversationId]);
  // The toolbar follows what is shown: a search in Trash or Spam acts as those labels do.
  const inTrashOrSpam = kind !== "normal";

  const openCompose = useCallback(
    (mode: ComposeMode, emailId?: Id) => {
      const target = emailId ?? last?.id;
      if (target) compose.open({ mode, emailId: target, threadId: conversationId });
    },
    [compose, conversationId, last],
  );

  const conversationActions = useMemo(
    () => ({
      archive: () => {
        void actions.archive([acted], scope);
        goBack(true);
      },
      trash: () => {
        void actions.trash([acted], scope);
        goBack(true);
      },
      reportSpam: () => {
        // Spam's own copy (the server learns from it); roles as they are now, as the runner does.
        void actions.run(() => planReportSpam([acted], { kind: scope.kind, roles: rolesFrom(labels.store) }), REPORT_SPAM_COPY);
        goBack(true);
      },
      notSpam: () => {
        void actions.run(() => planNotSpam([acted], { kind: scope.kind, roles: rolesFrom(labels.store) }), NOT_SPAM_COPY);
        goBack(true);
      },
      markUnread: () => {
        void actions.markUnread([acted], scope);
        goBack();
      },
      deleteForever: () => {
        setConfirmForever(false);
        void actions.deleteForever([acted], scope);
        goBack(true);
      },
    }),
    [actions, acted, scope, goBack, labels.store],
  );

  const cardActions = (m: ConvMessage, index: number): MessageCardActions => ({
    toggle: () => toggle(m.id),
    reply: () => openCompose("reply", m.id),
    replyAll: () => openCompose("replyAll", m.id),
    forward: () => openCompose("forward", m.id),
    toggleStar: () => {
      const on = m.keywords[FLAGGED] !== true;
      void actions.run(planEdits(scopeOne(m), () => ({ keywords: { [FLAGGED]: on } })), on ? COPY.star : COPY.unstar, { toast: false });
    },
    markUnreadFromHere: () => {
      const from = shown.slice(index);
      void actions.run(
        planEdits([{ id: conversationId, messages: from }], () => ({ keywords: { [SEEN]: false } })),
        actionCopy("Marked as unread from here.", "Marked as unread from here.", "Couldn't mark the messages as unread.", "Couldn't mark the messages as unread."),
      );
      goBack();
    },
    trash: () => {
      void actions.run(
        () => planTrash(scopeOne(m), scope),
        actionCopy("Message moved to Trash.", "Messages moved to Trash.", "Couldn't delete the message.", "Couldn't delete the messages."),
      );
      if (shown.length === 1) goBack();
    },
    reportSpam: () => {
      void actions.run(() => planReportSpam(scopeOne(m), scope), REPORT_SPAM_MESSAGE_COPY);
      if (shown.length === 1) goBack();
    },
    filterLike: () => filterMessagesLike([m], me),
    block: () => {
      const sender = m.from?.[0];
      if (!sender) return;
      if (block.isBlocked(sender.email)) void block.unblock(sender.email);
      else block.ask(sender);
    },
    showOriginal: () => setOriginal(m),
    displayImages: () => setImagesShown((s) => new Set(s).add(m.id)),
    loadInlineImages: () => loadInlineImages(m.id),
    alwaysDisplayImages: () => {
      const sender = m.from?.[0]?.email;
      if (sender) allowance.allow(sender);
      setImagesShown((s) => new Set(s).add(m.id));
    },
  });

  // ---- Keyboard (brief 14): n / p / u / r / a / f and the toolbar keys ----------------
  const focusMessage = useCallback(
    (id: Id) => {
      setCursor(id);
      if (!items.some((i) => i.kind === "message" && i.message.id === id)) setRevealed(true);
      requestAnimationFrame(() => document.getElementById(messageCardId(id))?.focus());
    },
    [items],
  );
  const latest = useRef({ shown, cursor, focusMessage, toggle, goBack, openCompose, conversationActions });
  useEffect(() => {
    latest.current = { shown, cursor, focusMessage, toggle, goBack, openCompose, conversationActions };
  });
  useEffect(() => {
    const step = (delta: number) => {
      const { shown: list, cursor: at, focusMessage: focus } = latest.current;
      if (list.length === 0) return;
      const index = at ? list.findIndex((m) => m.id === at) : list.length - 1;
      const next = list[Math.min(list.length - 1, Math.max(0, (index === -1 ? list.length - 1 : index) + delta))];
      if (next) focus(next.id);
    };
    const controller: ConversationController = {
      conversationId,
      messageIds: () => latest.current.shown.map((m) => m.id),
      focusedMessageId: () => latest.current.cursor,
      focusMessage: (id) => latest.current.focusMessage(id),
      nextMessage: () => step(1),
      previousMessage: () => step(-1),
      toggleMessage: (id) => {
        const target = id ?? latest.current.cursor;
        if (target) latest.current.toggle(target);
      },
      back: () => latest.current.goBack(),
      reply: (id) => latest.current.openCompose("reply", id ?? latest.current.cursor ?? undefined),
      replyAll: (id) => latest.current.openCompose("replyAll", id ?? latest.current.cursor ?? undefined),
      forward: (id) => latest.current.openCompose("forward", id ?? latest.current.cursor ?? undefined),
      archive: () => latest.current.conversationActions.archive(),
      trash: () => latest.current.conversationActions.trash(),
      reportSpam: () => latest.current.conversationActions.reportSpam(),
      markUnread: () => latest.current.conversationActions.markUnread(),
    };
    return setActiveConversation(controller);
  }, [conversationId]);

  // ---- Header ------------------------------------------------------------------------
  const subject = (shown[0]?.subject ?? snapshot.messages[0]?.subject ?? "").trim() || "(no subject)";
  const chipList = useMemo<ChipLabel[]>(() => labels.labels.map((l) => ({ id: l.id, title: l.system ? l.title : l.path, system: l.system })), [labels.labels]);
  const chips = chipLabels(labelIdsOf(conversation, scope), chipList, label?.mailboxId);
  const current = route.kind === "search" ? null : route;
  const emailIds = shown.map((m) => m.id);

  return (
    <section className="conv-page" aria-labelledby="conv-subject" data-pane={readingPane}>
      <ConversationToolbarShell backHref={formatRoute(backRoute)} backLabel={label ? `Back to ${label.title}` : "Back to search results"}>
        <span className="conv-toolbar-divider" aria-hidden="true" />
        {!inTrashOrSpam ? <IconButton label="Archive" icon={Archive} onClick={conversationActions.archive} /> : null}
        {kind === "spam" ? (
          <IconButton label="Not spam" icon={ShieldCheck} onClick={conversationActions.notSpam} />
        ) : (
          <IconButton label="Report spam" icon={ShieldAlert} onClick={conversationActions.reportSpam} />
        )}
        {inTrashOrSpam ? (
          <IconButton label="Delete forever" icon={Trash2} onClick={() => setConfirmForever(true)} />
        ) : (
          <IconButton label="Delete" icon={Trash2} onClick={conversationActions.trash} />
        )}
        <span className="conv-toolbar-divider" aria-hidden="true" />
        <IconButton label="Mark as unread" icon={MailOpen} onClick={conversationActions.markUnread} />
        <LabelMenu conversationIds={[conversationId]} emailIds={emailIds} current={current} mode="move" />
        <LabelMenu conversationIds={[conversationId]} emailIds={emailIds} current={current} mode="label" />
      </ConversationToolbarShell>

      <div className="conv-scroll">
        <header className="conv-header">
          <h1 id="conv-subject" className="conv-subject" ref={headingRef} tabIndex={-1}>
            {subject}
          </h1>
          {chips.length > 0 ? (
            <ul className="conv-chips" aria-label="Labels">
              {chips.map((c) => (
                <li key={c.id} className="chip conv-chip">
                  {c.system === "inbox" ? <Inbox aria-hidden="true" /> : null}
                  {c.title}
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        {hiddenCount > 0 && scope.kind === "normal" ? (
          <p className="conv-note conv-hidden-note">
            {hiddenCount === 1 ? "One message in this conversation is in Trash or Spam." : `${hiddenCount} messages in this conversation are in Trash or Spam.`}
          </p>
        ) : null}

        <ol className="conv-messages" aria-label="Messages">
          {items.map((item) =>
            item.kind === "fold" ? (
              <li key={item.key} className="conv-fold">
                <button type="button" className="conv-fold-button" onClick={() => setRevealed(true)}>
                  <span className="conv-fold-count">{item.count}</span> older messages
                </button>
              </li>
            ) : (
              <li key={item.message.id}>
                <MessageCard
                  message={item.message}
                  expanded={isExpanded(item.message.id)}
                  last={item.message.id === last?.id}
                  me={me}
                  body={snapshot.bodies.get(item.message.id)}
                  theme={resolvedTheme}
                  allowRemote={imagesShown.has(item.message.id) || (item.message.from?.[0] ? allowance.allows(item.message.from[0].email, item.message.authResults) : false)}
                  canReportSpam={kind !== "spam"}
                  senderBlocked={item.message.from?.[0] ? block.isBlocked(item.message.from[0].email) : false}
                  actions={cardActions(item.message, item.index)}
                  onFocusCard={() => setCursor(item.message.id)}
                />
              </li>
            ),
          )}
        </ol>

        <div className="conv-inline-reply" id={inlineReplySlotId(conversationId)}>
          {renderInlineReply && last ? renderInlineReply({ threadId: conversationId, lastMessageId: last.id, messageIds: emailIds, subject }) : null}
        </div>
      </div>

      {original ? <ShowOriginal message={original} onClose={() => setOriginal(null)} /> : null}
      {block.dialog}
      {confirmForever ? (
        <ConfirmDialog
          title="Delete forever?"
          body="This conversation will be deleted forever. You can't undo this."
          confirmLabel="Delete forever"
          onConfirm={conversationActions.deleteForever}
          onCancel={() => setConfirmForever(false)}
        />
      ) : null}
    </section>
  );
}
