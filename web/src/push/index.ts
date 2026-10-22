// Web Push and the service worker, page side (brief 16).
//
//   registerWorker()      main.tsx (install.ts): register /sw.js, listen to it, apply updates safely
//   <PushHost />          the shell, once per session: refresh on sign-in, end on sign-out
//   <WebPushToggle />     settings: the opt-in, next to desktop notifications
//   onBeforeSignOut(fn) / runBeforeSignOut()   work that needs the tokens one last time (the list is auth's, run before every sign-out)
//
// The worker itself is in ../sw (sw.ts, with the pure decisions in notify.ts and routing.ts).

export { setSignedIn, willNotifyHere } from "./register";
export { registerWorker } from "./install";
export { PushHost } from "./PushHost";
export { WebPushToggle } from "./WebPushToggle";
export { onBeforeSignOut, runBeforeSignOut, BEFORE_SIGN_OUT_MS } from "./beforeSignOut";
export { WebPush, type WebPushSnapshot, type WebPushProblem } from "./webPush";
export { getActiveWebPush, useActiveWebPush } from "./active";
