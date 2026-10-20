// Desktop notifications (brief 11). For brief 12's settings page:
//   useDesktopNotifications() / getDesktopNotifications / setDesktopNotifications / subscribeDesktopNotifications
// For brief 16's Web Push: NewMailDetector + notifyNewMail's wording rules (sender, subject, no body).

export {
  getDesktopNotifications,
  notificationPermission,
  setDesktopNotifications,
  setNotifyAccount,
  subscribeDesktopNotifications,
  useDesktopNotifications,
} from "./settings";
export { NewMailDetector, type InboxMessage } from "./detector";
export { MAX_SEPARATE, notifyNewMail, type NotifyDeps } from "./show";
