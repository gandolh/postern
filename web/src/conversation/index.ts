// The conversation view. What other briefs import:
//
//   ConversationView                    the shell renders it
//   applyConversationStateChange        pass every push StateChange
//   getActiveConversation / useActiveConversation / subscribeActiveConversation
//                                       N / p / u / r / a / f and the toolbar keys
//   setInlineReplyRenderer / inlineReplySlotId / messageCardId
//                                       The inline reply below the last message
//   quoteAttribution / quotePlainText / forwardHeaderText / htmlBodyText
//                                       Quoting, as text
//   ConversationStore                   the data (tests, search if it previews)

export { ConversationView, type ConversationViewProps } from "./ConversationView";
export {
  applyConversationStateChange,
  getActiveConversation,
  messageCardId,
  mountedConversationStores,
  subscribeActiveConversation,
  useActiveConversation,
  type ConversationController,
} from "./registry";
export { inlineReplySlotId, setInlineReplyRenderer, useInlineReplyRenderer, type InlineReplyContext, type InlineReplyRenderer } from "./inlineReply";
export { forwardHeaderText, htmlBodyText, quoteAttribution, quotePlainText, type QuotedMessage } from "./quoting";
export {
  ConversationStore,
  MESSAGE_BODY_PROPERTIES,
  MESSAGE_META_PROPERTIES,
  type BodyState,
  type ConversationSnapshot,
  type ConvMessage,
  type MessageBody,
} from "./conversationStore";
export { forgedAddressInName, readAuthenticationResults, type AuthenticationSummary } from "./people";
