// Applying, removing and moving labels on conversations, and editing the
// labels themselves, for React. Wraps brief 06's useMailActions so the
// optimistic update, the toast and Undo are the list's own.
//
//   const ops = useLabelOps(current);       // current: the label route being viewed, or null (search)
//   await ops.apply(threadIds, labelId, true);          // add (false: remove) a label on conversations
//   await ops.move(threadIds, targetLabelId);           // Gmail's "Move to"
//   ops.edits.create("Clients", parentId) ...           // labelEdits.ts bound to the session
//
// `threadIds` are conversation (Thread) ids. With `{ all: true }` the whole
// mounted list is used ("Select all N"); isAllSelected(ids) tells you.

import type { Id } from "@postern/jmap";
import { useMemo } from "react";
import { rolesFrom, useMailActions, type ActionCopy, type ActionOutcome } from "../actions";
import { useJmap } from "../auth";
import type { LabelRoute } from "../shell/router";
import { resolveConversations, scopeFor, type ResolveOptions } from "./conversations";
import { createLabel, deleteLabel, nestLabel, renameLabel, setLabelSubscribed, type LabelEditDeps } from "./labelEdits";
import { useLabelsStore } from "./useLabels";

const count = (n: number) => n.toLocaleString();

export function addedCopy(name: string): ActionCopy {
  return {
    done: (n) => (n === 1 ? `Label "${name}" added.` : `Label "${name}" added to ${count(n)} conversations.`),
    failed: (n) => (n === 1 ? `Couldn't add the label "${name}".` : `Couldn't add the label "${name}" to ${count(n)} conversations.`),
  };
}

export function removedCopy(name: string): ActionCopy {
  return {
    done: (n) => (n === 1 ? `Label "${name}" removed.` : `Label "${name}" removed from ${count(n)} conversations.`),
    failed: (n) => (n === 1 ? `Couldn't remove the label "${name}".` : `Couldn't remove the label "${name}" from ${count(n)} conversations.`),
  };
}

export function movedCopy(name: string): ActionCopy {
  return {
    done: (n) => (n === 1 ? `Conversation moved to "${name}".` : `${count(n)} conversations moved to "${name}".`),
    failed: (n) => (n === 1 ? `Couldn't move the conversation to "${name}".` : `Couldn't move ${count(n)} conversations to "${name}".`),
  };
}

export interface LabelOps {
  apply(threadIds: readonly Id[], labelId: Id, on: boolean, options?: ResolveOptions): Promise<ActionOutcome>;
  move(threadIds: readonly Id[], labelId: Id, options?: ResolveOptions): Promise<ActionOutcome>;
  edits: {
    create(name: string, parentId?: Id | null): Promise<Id>;
    rename(id: Id, name: string): Promise<void>;
    nest(id: Id, parentId: Id | null): Promise<void>;
    setSubscribed(id: Id, subscribed: boolean): Promise<void>;
    delete(id: Id): ReturnType<typeof deleteLabel>;
  };
}

export function useLabelOps(current: LabelRoute | null): LabelOps {
  const client = useJmap();
  const store = useLabelsStore();
  const actions = useMailActions();
  return useMemo(() => {
    const deps: LabelEditDeps = { caller: client, labels: store };
    const titleOf = (id: Id) => store.getSnapshot().byId.get(id)?.title ?? "label";
    /** The mailbox being viewed, which "Move to" takes the conversations out of. */
    const fromId = (): Id | undefined => {
      if (current === null) return undefined;
      const snapshot = store.getSnapshot();
      return current.kind === "label" ? current.labelId : snapshot.system[current.view].label?.id;
    };
    const scope = () => scopeFor(current, rolesFrom(store));
    return {
      async apply(threadIds, labelId, on, options) {
        const conversations = await resolveConversations(client, threadIds, options);
        if (conversations.length === 0) return "nothing";
        const name = titleOf(labelId);
        return actions.applyLabels(conversations, scope(), on ? { add: [labelId] } : { remove: [labelId] }, on ? addedCopy(name) : removedCopy(name));
      },
      async move(threadIds, labelId, options) {
        const conversations = await resolveConversations(client, threadIds, options);
        if (conversations.length === 0) return "nothing";
        return actions.moveTo(conversations, scope(), fromId(), labelId, movedCopy(titleOf(labelId)));
      },
      edits: {
        create: (name, parentId = null) => createLabel(deps, name, parentId),
        rename: (id, name) => renameLabel(deps, id, name),
        nest: (id, parentId) => nestLabel(deps, id, parentId),
        setSubscribed: (id, subscribed) => setLabelSubscribed(deps, id, subscribed),
        delete: (id) => deleteLabel(deps, id),
      },
    };
  }, [client, store, actions, current]);
}
