// Hash routes under the base (`/`), as Gmail has them. Every brief navigates
// through this module and never edits it.
//
//   #inbox  #starred  #snoozed  #sent  #drafts  #spam  #trash  #all   system labels
//   #label/<labelId>                                          a user label (by mailbox id)
//   #search/<query>                                           search results (query URI-encoded)
//   #<any of the above>/<conversationId>                      a conversation opened from there
//   #settings/<section>                                       settings (#settings alone is general)
//   #contacts                                                 contacts
//   #scheduled                                                messages waiting to be sent (brief 23)
//
// Anything else is the Inbox. Navigating pushes a history entry (the browser's
// own hash history), so back and forward work as in Gmail; `replace` swaps the
// current entry instead.
//
//   parseRoute(hash): Route        formatRoute(route): "#..."     routeHref = formatRoute
//   useRoute(): Route              navigate(route, { replace? })
//   withConversation(route, id), withoutConversation(route), isMailRoute(route), sameList(a, b)

import { useSyncExternalStore } from "react";

/**
 * The system labels, by the word in the URL. Spam is role `junk`; All Mail is
 * role `archive`; Snoozed (brief 24) has no role and is found by its name.
 */
export type SystemView = "inbox" | "starred" | "snoozed" | "sent" | "drafts" | "spam" | "trash" | "all";

export const SYSTEM_VIEWS: readonly SystemView[] = ["inbox", "starred", "snoozed", "sent", "drafts", "spam", "trash", "all"];

/** A system label's list, or a conversation opened from it: `#inbox`, `#inbox/<id>`. */
export interface SystemLabelRoute {
  kind: "system";
  view: SystemView;
  /** The open conversation (a JMAP Thread id), if any. */
  conversationId?: string;
}

/** A user label's list, or a conversation opened from it: `#label/<id>`, `#label/<id>/<conversationId>`. */
export interface UserLabelRoute {
  kind: "label";
  /** The label's mailbox id. */
  labelId: string;
  conversationId?: string;
}

/** A system or user label. */
export type LabelRoute = SystemLabelRoute | UserLabelRoute;

/** Search results, or a conversation opened from them: `#search/<query>`, `#search/<query>/<conversationId>`. */
export interface SearchResultsRoute {
  kind: "search";
  /** The query as typed (Gmail operators included); never empty. */
  query: string;
  conversationId?: string;
}

/** A route that shows conversations: a label or search results. */
export type MailRoute = LabelRoute | SearchResultsRoute;

/** `#settings/<section>`. Brief 12 defines the sections (general, accounts, labels, filters). */
export interface SettingsRoute {
  kind: "settings";
  section: string;
}

/** `#contacts`. */
export interface ContactsRoute {
  kind: "contacts";
}

/** `#scheduled`: the messages Schedule send is holding (brief 23). Not a label: a list of submissions. */
export interface ScheduledRoute {
  kind: "scheduled";
}

export type Route = MailRoute | SettingsRoute | ContactsRoute | ScheduledRoute;

export const INBOX: SystemLabelRoute = Object.freeze({ kind: "system", view: "inbox" }) as SystemLabelRoute;
export const DEFAULT_SETTINGS_SECTION = "general";

const IS_SYSTEM_VIEW = new Set<string>(SYSTEM_VIEWS);

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Encode one path segment: `/`, `%`, `#`, `?` and spaces are escaped. */
function encode(segment: string): string {
  return encodeURIComponent(segment);
}

function conversationFrom(segments: readonly string[]): { ok: true; id?: string } | { ok: false } {
  if (segments.length === 0) return { ok: true };
  if (segments.length > 1) return { ok: false };
  const id = decode(segments[0]!);
  return id ? { ok: true, id } : { ok: false };
}

/**
 * The route for a location hash (with or without the leading `#`). Anything
 * that is not a Postern route is the Inbox; `isCanonicalHash` tells the
 * caller whether the URL should be rewritten.
 */
export function parseRoute(hash: string): Route {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const segments = raw.split("/");
  const head = segments[0] ?? "";
  const rest = segments.slice(1);

  if (IS_SYSTEM_VIEW.has(head)) {
    const conversation = conversationFrom(rest);
    if (!conversation.ok) return INBOX;
    const route: SystemLabelRoute = { kind: "system", view: head as SystemView };
    if (conversation.id) route.conversationId = conversation.id;
    return route;
  }

  switch (head) {
    case "label": {
      const labelId = rest[0] ? decode(rest[0]) : null;
      if (!labelId) return INBOX;
      const conversation = conversationFrom(rest.slice(1));
      if (!conversation.ok) return INBOX;
      const route: UserLabelRoute = { kind: "label", labelId };
      if (conversation.id) route.conversationId = conversation.id;
      return route;
    }
    case "search": {
      const query = rest[0] ? decode(rest[0]) : null;
      if (!query || !query.trim()) return INBOX;
      const conversation = conversationFrom(rest.slice(1));
      if (!conversation.ok) return INBOX;
      const route: SearchResultsRoute = { kind: "search", query };
      if (conversation.id) route.conversationId = conversation.id;
      return route;
    }
    case "settings": {
      if (rest.length > 1) return INBOX;
      const section = rest[0] ? decode(rest[0]) : DEFAULT_SETTINGS_SECTION;
      return section ? { kind: "settings", section } : INBOX;
    }
    case "contacts":
      return rest.length === 0 ? { kind: "contacts" } : INBOX;
    case "scheduled":
      return rest.length === 0 ? { kind: "scheduled" } : INBOX;
    default:
      return INBOX;
  }
}

/** The hash for a route, with the leading `#`. Use it as an `href`. */
export function formatRoute(route: Route): string {
  let path: string;
  switch (route.kind) {
    case "system":
      path = route.view;
      break;
    case "label":
      path = `label/${encode(route.labelId)}`;
      break;
    case "search":
      path = `search/${encode(route.query)}`;
      break;
    case "settings":
      return `#settings/${encode(route.section || DEFAULT_SETTINGS_SECTION)}`;
    case "contacts":
      return "#contacts";
    case "scheduled":
      return "#scheduled";
  }
  return route.conversationId ? `#${path}/${encode(route.conversationId)}` : `#${path}`;
}

/** Alias of formatRoute, for `<a href={routeHref(route)}>`. */
export const routeHref = formatRoute;

/** True when `hash` is already the canonical form of the route it parses to. */
export function isCanonicalHash(hash: string): boolean {
  const withHash = hash.startsWith("#") ? hash : `#${hash}`;
  return formatRoute(parseRoute(withHash)) === withHash;
}

/** Does this route show conversations (a label or search results)? */
export function isMailRoute(route: Route): route is MailRoute {
  return route.kind === "system" || route.kind === "label" || route.kind === "search";
}

/** The same list with a conversation open. */
export function withConversation<R extends MailRoute>(route: R, conversationId: string): R {
  return { ...route, conversationId };
}

/** The list a conversation was opened from (Gmail's "Back to Inbox"). */
export function withoutConversation<R extends MailRoute>(route: R): R {
  const { conversationId: _drop, ...list } = route;
  return list as R;
}

/** Do two routes show the same list (ignoring the open conversation)? */
export function sameList(a: Route, b: Route): boolean {
  if (!isMailRoute(a) || !isMailRoute(b)) return false;
  return formatRoute(withoutConversation(a)) === formatRoute(withoutConversation(b));
}

// ---- The live route --------------------------------------------------------

let cachedHash: string | null = null;
let cachedRoute: Route = INBOX;

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

/** The route for the current location. Stable between hash changes. */
export function getRoute(): Route {
  const hash = currentHash();
  if (hash !== cachedHash) {
    cachedHash = hash;
    cachedRoute = parseRoute(hash);
  }
  return cachedRoute;
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Call `listener` when the route changes (navigation, back, forward, a typed URL). */
export function subscribeRoute(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener("hashchange", notify);
    window.addEventListener("popstate", notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("hashchange", notify);
      window.removeEventListener("popstate", notify);
    }
  };
}

/** The current route, re-rendering on every change. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribeRoute, getRoute, () => INBOX);
}

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one (redirects, canonical URLs). */
  replace?: boolean;
}

/** Go to a route. Pushes a history entry unless `replace`. Going where you are does nothing. */
export function navigate(route: Route, options: NavigateOptions = {}): void {
  const hash = formatRoute(route);
  if (hash === currentHash()) return;
  if (options.replace) {
    // replaceState fires no hashchange, so tell the subscribers ourselves.
    window.history.replaceState(window.history.state, "", hash);
    notify();
  } else {
    window.location.hash = hash;
  }
}
