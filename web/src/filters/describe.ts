// A filter in a line, as Gmail's filter list shows it:
//   Matches: from:(bob@x.test) subject:(invoice)
//   Do this: Skip the Inbox, Apply label "Work"

import { joinWords, type FilterActions, type FilterCriteria, type SizeCriterion } from "@postern/jmap";

const UNIT_WORD: Record<SizeCriterion["unit"], string> = { B: "bytes", K: "KB", M: "MB" };

export function describeSize(size: SizeCriterion): string {
  return `${size.comparison === "larger" ? "larger than" : "smaller than"} ${size.amount.toLocaleString()} ${UNIT_WORD[size.unit]}`;
}

/** The criteria in Gmail's operator style. */
export function describeCriteria(c: FilterCriteria): string {
  const parts: string[] = [];
  if (c.from.length > 0) parts.push(`from:(${c.from.join(" OR ")})`);
  if (c.to.length > 0) parts.push(`to:(${c.to.join(" OR ")})`);
  if (c.subject) parts.push(`subject:(${c.subject})`);
  if (c.words.length > 0) parts.push(joinWords(c.words));
  if (c.notWords.length > 0) parts.push(`-{${joinWords(c.notWords)}}`);
  if (c.hasAttachment) parts.push("has:attachment");
  if (c.size) parts.push(describeSize(c.size));
  return parts.join(" ");
}

/** The actions as Gmail words. `labelTitle` names a label by id (its path), or undefined when it is gone. */
export function describeActions(a: FilterActions, labelTitle: (id: string) => string | undefined): string[] {
  const out: string[] = [];
  if (a.archive) out.push("Skip the Inbox");
  if (a.markRead) out.push("Mark as read");
  if (a.star) out.push("Star it");
  if (a.label) {
    const title = labelTitle(a.label.id);
    out.push(title ? `Apply label "${title}"` : `Apply label "${a.label.name}" (deleted)`);
  }
  if (a.forwardTo) out.push(`Forward to ${a.forwardTo}`);
  if (a.delete) out.push("Delete it");
  if (a.neverSpam) out.push("Never send it to Spam");
  return out;
}
