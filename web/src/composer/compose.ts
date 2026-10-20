// Brief 08 replaces this stub: the composer's options, provider and hook.
//
//   const compose = useCompose();
//   compose.open();                                              a new message
//   compose.open({ mode: "reply", emailId, threadId });          reply / replyAll / forward
//   compose.open({ draftId });                                    resume a draft
//   compose.open({ to: [{ name: null, email: "bob@postern.test" }], subject: "Hi" });
//
// Until brief 08, open() does nothing.

import type { EmailAddress, Id } from "@postern/jmap";
import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";

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
  /** Docked bottom-right (default) or full screen. */
  display?: "docked" | "fullscreen";
}

export interface ComposeApi {
  /** Open a composer. A no-op until brief 08. */
  open(options?: ComposeOptions): void;
}

const NOOP: ComposeApi = { open: () => {} };

const ComposeContext = createContext<ComposeApi>(NOOP);

/** Wraps the shell, so the Compose button, the list and the conversation view share one composer. */
export function ComposerProvider({ children }: { children: ReactNode }) {
  const api = useMemo<ComposeApi>(() => NOOP, []);
  return createElement(ComposeContext.Provider, { value: api }, children);
}

/** Open the composer. */
export function useCompose(): ComposeApi {
  return useContext(ComposeContext);
}
