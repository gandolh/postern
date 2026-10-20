// The composer (brief 08). The shell imports:
//   <ComposerProvider>   around the shell
//   <ComposerHost />     once, in the bottom-right layer
//   useCompose()         { open(options?: ComposeOptions) }
//
// Brief 14's keys: composeNew (c), composeFromConversation (r / a / f),
// sendFocusedComposer (Ctrl+Enter), isTypingInComposer, getComposer.
// Brief 15: ./recipients.ts is the autocomplete seam.

export {
  ComposerProvider,
  useCompose,
  useComposerStore,
  type ComposeApi,
  type ComposeMode,
  type ComposeOptions,
} from "./compose";
export { ComposerHost } from "./ComposerHost";
export { getComposer } from "./registry";
export { composeNew, composeFromConversation, sendFocusedComposer, isTypingInComposer, composerKeyOf, COMPOSER_ATTR } from "./shortcuts";
export { recipientSource, type RecipientSource, type RecipientSuggestion } from "./recipients";
export type { ComposerStore } from "./store";
export type { ComposeSnapshot, Placement } from "./session";
