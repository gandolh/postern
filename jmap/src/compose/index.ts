// Writing mail (brief 08): pure helpers for the composer. They build Email/set
// create objects (bodyStructure, headers), reply and forward subjects and
// threading headers, reply-all recipients, quotes, and parse typed addresses.
// No network, no DOM.

export {
  isValidEmail,
  splitAddressList,
  parseAddress,
  parseAddressList,
  addressKey,
  sameAddress,
  dedupeAddresses,
  formatAddress,
  type ParsedAddress,
} from "./address.js";
export { replySubject, forwardSubject, baseSubject } from "./subject.js";
export { threadingHeaders, newMessageId, MAX_REFERENCES, type ThreadingHeaders, type ThreadingSource } from "./headers.js";
export { replyRecipients, replyIdentityEmail, type ReplyMode, type ReplyRecipients, type ReplySource } from "./replyRecipients.js";
export {
  escapeHtml,
  textToHtml,
  formatQuoteDate,
  quoteAttribution,
  quotePlainText,
  replyQuote,
  forwardHeaderLines,
  forwardQuote,
  mentionsAttachment,
  QUOTE_CLASS,
  QUOTE_BLOCK_STYLE,
  type Quote,
  type QuoteFormat,
  type QuoteSource,
} from "./quote.js";
export {
  buildBody,
  buildDraftEmail,
  forwardAttachments,
  draftParts,
  referencedCids,
  type DraftAttachment,
  type DraftContent,
  type DraftPlacement,
} from "./body.js";
