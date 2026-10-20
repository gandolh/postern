// Block "<sender>" from a message's menu: asks first, then adds the address
// to Postern's script, which files that sender's new mail into Spam. Unblock
// takes it out again (here or in Settings → Filters). The block's Undo is in
// the shared undo list (actions/undo.ts), so `z` undoes it too.
//
//   const block = useBlockSender();
//   block.isBlocked("bob@x.test"); block.ask({ name, email }); block.unblock("bob@x.test");
//   {block.dialog}   render once

import { withBlocked, withoutBlocked, type EmailAddress } from "@postern/jmap";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { isQuietError } from "../actions/runner";
import { runUndo, setUndo, type UndoEntry } from "../actions/undo";
import { ConfirmDialog } from "../list/ConfirmDialog";
import "../list/list.css";
import { useToast } from "../shell/toast";
import type { SaveOutcome } from "./filterScript";
import { useFilters } from "./store";

export const FILTERS_OFF_NOTE = "Filters are off while your vacation responder is on.";

export interface BlockSender {
  isBlocked(email: string): boolean;
  /** Ask, then block. */
  ask(sender: EmailAddress): void;
  unblock(email: string): Promise<void>;
  /** The confirmation, when open. Render it once. */
  dialog: ReactNode;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "unknown error";
}

export function useBlockSender(): BlockSender {
  const filters = useFilters();
  const toast = useToast();
  const [asking, setAsking] = useState<EmailAddress | null>(null);
  const blocked = filters.loaded?.set.blocked;
  const store = filters.store;

  const isBlocked = useCallback((email: string) => (blocked ?? []).includes(email.trim().toLowerCase()), [blocked]);

  const unblock = useCallback(
    async (email: string) => {
      const address = email.trim().toLowerCase();
      try {
        await store.save((set) => withoutBlocked(set, address));
        toast.show({ message: `${address} unblocked.` });
      } catch (e) {
        // Session trouble is the sign-in layer's to show.
        if (!isQuietError(e)) toast.show({ message: `Couldn't unblock ${address}: ${errorText(e)}` });
      }
    },
    [store, toast],
  );

  const block = useCallback(
    async (sender: EmailAddress) => {
      const address = sender.email.trim().toLowerCase();
      let outcome: SaveOutcome;
      try {
        outcome = await store.save((set) => withBlocked(set, address));
      } catch (e) {
        if (!isQuietError(e)) toast.show({ message: `Couldn't block ${address}: ${errorText(e)}` });
        return;
      }
      const entry: UndoEntry = { label: `${address} blocked.`, undo: () => unblock(address) };
      setUndo(entry);
      toast.show({
        message: `${address} blocked. New messages from them will go to Spam.${outcome.heldByVacation ? ` ${FILTERS_OFF_NOTE}` : ""}`,
        action: { label: "Undo", onClick: () => void runUndo(entry) },
      });
    },
    [store, toast, unblock],
  );

  const dialog = useMemo(() => {
    if (!asking) return null;
    const who = asking.name?.trim() || asking.email;
    return (
      <ConfirmDialog
        title={`Block ${who}?`}
        body={`New messages from ${asking.email} will go to Spam. You can unblock them in Settings, under Filters.`}
        confirmLabel="Block"
        onConfirm={() => {
          setAsking(null);
          void block(asking);
        }}
        onCancel={() => setAsking(null)}
      />
    );
  }, [asking, block]);

  return { isBlocked, ask: setAsking, unblock, dialog };
}
