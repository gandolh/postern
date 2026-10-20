// Opening a conversation marks its unread messages read ($seen), as Gmail
// does. Not through useMailActions(): an action registers for Undo (`z`),
// and opening a conversation must not replace the last real action's undo,
// nor toast. The local patch still goes out on the bus first, so the list
// row turns read at once, and "settled" follows so every view catches up.

import type { MethodCaller } from "@postern/jmap";
import { publishMailChange, publishPending } from "../actions/bus";
import type { Conversation, ConversationScope } from "../actions/conversation";
import { sendPlan } from "../actions/execute";
import { isEmptyPlan } from "../actions/patches";
import { planRead } from "../actions/plans";
import { isQuietError } from "../actions/runner";

/** Mark the conversation's shown messages read. Resolves to whether anything was sent. Never rejects. */
export async function markReadOnOpen(caller: MethodCaller, conversation: Conversation, scope: ConversationScope, syncLabels: () => void): Promise<boolean> {
  const plan = planRead([conversation], scope, true);
  if (isEmptyPlan(plan)) return false;
  const answered = publishPending(plan.update);
  try {
    const result = await sendPlan(caller, plan);
    answered();
    if (!isEmptyPlan(result.failed)) publishMailChange({ kind: "patch", update: result.failed.inverse });
  } catch (err) {
    answered();
    publishMailChange({ kind: "patch", update: plan.inverse });
    if (!isQuietError(err)) console.warn("Couldn't mark the conversation as read", err);
  } finally {
    answered();
  }
  syncLabels();
  publishMailChange({ kind: "settled" });
  return true;
}
