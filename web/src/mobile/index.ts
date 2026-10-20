// The phone (brief 16). What other folders import:
//
//   <PhoneComposeButton route />   the shell, under 600 px: Compose floats bottom-right
//   useListGestures(...)           ConversationList: swipe a row, pull to refresh (touch only)
//   <SwipeSettings />              settings: what a swipe left / right does
//
// The single-column phone layout itself is shell/MainArea.tsx (reading pane
// forced to none under PHONE_QUERY); touch-target sizes and the phone row are
// in mobile.css. The composer is already full screen under 600 px (brief 08).

export { PhoneComposeButton } from "./ComposeButton";
export { useListGestures, type ListGestureOptions } from "./useListGestures";
export { SwipeSettings } from "./SwipeSettings";
export { classify, PullTracker, swipeLabel, swipeOutcome, SwipeTracker, type Direction, type Gesture, type SwipeContext } from "./gestures";
