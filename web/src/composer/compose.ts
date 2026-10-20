// The composer's options, provider and hook (brief 08).
//
//   const compose = useCompose();
//   compose.open();                                              a new message
//   compose.open({ mode: "reply", emailId, threadId });          reply / replyAll / forward (inline when the conversation is open)
//   compose.open({ draftId });                                    resume a draft
//   compose.open({ to: [{ name: null, email: "bob@postern.test" }], subject: "Hi" });
//
// ComposerProvider makes one ComposerStore per signed-in session (it needs
// the JMAP client, the labels and the toast, so it sits inside the shell's
// LabelsProvider and ToastProvider). It does no network work until a composer
// opens.

import type { EmailAddress, Id } from "@postern/jmap";
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onBeforeSignOut, useAccount, useJmap } from "../auth";
import { useLabelsStore } from "../labels/useLabels";
import { getDefaultIdentityId } from "../prefs";
import { useToast } from "../shell/toast";
import { recipientSource } from "./recipients";
import { setActiveComposer } from "./registry";
import { ComposerStore } from "./store";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeOptions {
  /** Default "new". reply, replyAll and forward need `emailId`. */
  mode?: ComposeMode;
  /** The message replied to or forwarded (JMAP Email id). */
  emailId?: Id;
  /** Its conversation (JMAP Thread id), for the inline reply. */
  threadId?: Id;
  /** An existing draft to open (JMAP Email id in Drafts). */
  draftId?: Id;
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject?: string;
  /** Plain text to start the body with (a mailto: body). */
  body?: string;
  /**
   * Docked bottom-right, full screen, or inline under the open conversation.
   * Unset: replies and forwards go inline when their conversation is on
   * screen, everything else docks.
   */
  display?: "docked" | "fullscreen" | "inline";
}

export interface ComposeApi {
  /** Open a composer. */
  open(options?: ComposeOptions): void;
}

const NOOP: ComposeApi = { open: () => {} };

const ComposeContext = createContext<ComposeApi>(NOOP);
const StoreContext = createContext<ComposerStore | null>(null);

/** Wraps the shell, so the Compose button, the list and the conversation view share one composer. */
export function ComposerProvider({ children }: { children: ReactNode }) {
  const client = useJmap();
  const account = useAccount();
  const labels = useLabelsStore();
  const toast = useToast();
  const [store] = useState(
    () =>
      new ComposerStore({
        client,
        username: account.username,
        labels,
        toast,
        recipients: recipientSource(client),
        defaultIdentityId: getDefaultIdentityId,
      }),
  );
  useEffect(() => {
    store.activate();
    const unset = setActiveComposer(store);
    // Before any sign-out drops the tokens: send what is held for Undo, save unsaved drafts.
    const offSignOut = onBeforeSignOut(() => store.flushForSignOut());
    return () => {
      offSignOut();
      unset();
      store.dispose();
    };
  }, [store]);
  const api = useMemo<ComposeApi>(() => ({ open: (options) => void store.open(options) }), [store]);
  return createElement(StoreContext.Provider, { value: store }, createElement(ComposeContext.Provider, { value: api }, children));
}

/** Open the composer. */
export function useCompose(): ComposeApi {
  return useContext(ComposeContext);
}

/** The store behind the composer windows (inside ComposerProvider only). */
export function useComposerStore(): ComposerStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useComposerStore must be used inside <ComposerProvider>");
  return store;
}

/** The store, or null outside a ComposerProvider (tests of other screens). */
export function useOptionalComposerStore(): ComposerStore | null {
  return useContext(StoreContext);
}
