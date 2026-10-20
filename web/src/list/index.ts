// The conversation list (brief 06). What other briefs import:
//
//   ListRoute                  the shell renders it for label routes
//   ConversationList           the list body with a query of your own (brief 10's search results)
//   labelListView              a label's ListQuery and presentation
//   ListStore / useListStore   the data, kept current
//   applyListStateChange       brief 11: pass every push StateChange
//   getActiveList / useActiveList / subscribeActiveList   brief 14: the list keys drive
//   undoLast                   brief 14: z
//   ROW_PROPERTIES / MESSAGE_PROPERTIES / PAGE_SIZE   what a page fetches
//   summarizeSenders / formatListDate / chipLabels / parseHighlights   row text

export { ListRoute, type ListRouteProps } from "./ListRoute";
export { ConversationList, type ConversationListProps, type ListApi } from "./ConversationList";
export { labelListView, type LabelListView } from "./view";
export { ListStore, MESSAGE_PROPERTIES, NEWEST_FIRST, PAGE_SIZE, ROW_PROPERTIES, type ListStoreOptions } from "./listStore";
export { queryKey, useListStore } from "./useListStore";
export {
  applyListStateChange,
  getActiveList,
  mountedListStores,
  registerListStore,
  setActiveList,
  subscribeActiveList,
  useActiveList,
} from "./registry";
export type { ListController, SelectKind } from "./controller";
export type { ConversationRow, ListPresentation, ListQuery, ListSnapshot, RowMessage } from "./types";
export {
  chipLabels,
  formatFullDate,
  formatListDate,
  parseHighlights,
  summarizeSenders,
  type ChipLabel,
  type DateOptions,
  type HighlightRun,
  type SenderMode,
  type SenderPart,
  type SenderSummary,
} from "./format";
export { ConversationRowView, PlaceholderRow, type RowContext, type RowHandlers } from "./Row";
export { undoLast } from "../actions/undo";
