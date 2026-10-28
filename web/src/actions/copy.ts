// What a toast says about an action, singular and plural, and what it counts.
// A row is a conversation, or a message with conversation view off (brief 22),
// and since brief 26 the copy says which: "Conversation archived." with the
// pref on, "Message archived." with it off. The noun is filled in when the
// toast is made, so a template names it with a token:
//
//   const archived = actionCopy("{Thing} archived.", "{n} {things} archived.", "Couldn't archive the {thing}.", "Couldn't archive {n} {things}.");
//   archived.done(3, "message")   // "3 messages archived."
//   archived.done(1)              // "Conversation archived."
//
// Tokens are replaced in the template only, never in text put into it, so copy
// that quotes a label's name (labels/useLabelOps.ts) builds its strings itself.
// Imports nothing, so runner.ts, spam.ts and snooze.ts (which runner.ts
// imports) all build their copy here.

/** What a row of the list is: a conversation, or a message with conversation view off. */
export type RowNoun = "conversation" | "message";

/** The noun for a list in this mode. */
export function rowNoun(conversationView: boolean): RowNoun {
  return conversationView ? "conversation" : "message";
}

/** "conversation" or "conversations", "message" or "messages", for `count`. */
export function nounFor(count: number, noun: RowNoun = "conversation"): string {
  return count === 1 ? noun : `${noun}s`;
}

/** "Conversation", "Message". */
export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the toast says about an action. `noun` defaults to "conversation". */
export interface ActionCopy {
  /** "Conversation archived." / "3 conversations archived." */
  done: (count: number, noun?: RowNoun) => string;
  /** "Couldn't archive the conversation." / "Couldn't archive 3 conversations." */
  failed: (count: number, noun?: RowNoun) => string;
}

const TOKEN = /\{(n|thing|things|Thing|Things)\}/g;

function fill(template: string, count: number, noun: RowNoun): string {
  return template.replace(TOKEN, (_, token: string) => {
    switch (token) {
      case "n":
        return count.toLocaleString();
      case "thing":
        return noun;
      case "things":
        return `${noun}s`;
      case "Thing":
        return capitalised(noun);
      default:
        return capitalised(`${noun}s`);
    }
  });
}

/**
 * Gmail's toast wording, singular and plural. `{n}` is the count, `{thing}` /
 * `{things}` the noun (`{Thing}` / `{Things}` capitalised).
 */
export function actionCopy(oneDone: string, manyDone: string, oneFailed: string, manyFailed: string): ActionCopy {
  return {
    done: (count, noun = "conversation") => fill(count === 1 ? oneDone : manyDone, count, noun),
    failed: (count, noun = "conversation") => fill(count === 1 ? oneFailed : manyFailed, count, noun),
  };
}
