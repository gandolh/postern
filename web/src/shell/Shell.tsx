// The app shell: Gmail's arrangement in Postern's own face. A top
// bar, the navigation with Compose and the labels, and the main panel; the
// composer layer bottom-right and the toast bottom-left.
//
// It renders the later briefs' components from their own folders (list,
// conversation, search, settings, contacts, composer, keys, live) and never
// needs editing when they land. Rendered by App inside <SessionProvider>, so
// everything here goes on sign-out.

import { useCallback, useEffect, useRef, useState } from "react";
import { NavDrawer } from "../components/ui/NavDrawer";
import { ComposerHost, ComposerProvider } from "../composer";
import { HelpSheet, KeysProvider, ShortcutsHost } from "../keys";
import { LabelsProvider, useLabels } from "../labels/useLabels";
import { LiveHost } from "../live/LiveHost";
import { PrefsHost } from "../prefs";
import { PushHost } from "../push/PushHost";
import { SnoozeHost } from "../snooze/SnoozeHost";
import { PhoneComposeButton } from "../mobile";
import { PHONE_QUERY, WIDE_QUERY } from "./breakpoints";
import { MainArea } from "./MainArea";
import { Nav, NavMemoryProvider, type NavMemory, type NavProps } from "./Nav";
import { isCanonicalHash, navigate, parseRoute, subscribeRoute, useRoute } from "./router";
import { ConnectionBanner, useOnline } from "./states";
import { StatusSlotProvider } from "./status";
import { ToastProvider } from "../components/ui/Toast";
import { TopBar } from "./TopBar";
import { useMediaQuery } from "./useMediaQuery";

export { PHONE_QUERY, WIDE_QUERY } from "./breakpoints";

export function Shell() {
  return (
    <LabelsProvider>
      <ToastProvider>
        <ComposerProvider>
          <KeysProvider>
            <StatusSlotProvider>
              <PrefsHost />
              <ShellLayout />
              <LiveHost />
              <PushHost />
              <SnoozeHost />
            </StatusSlotProvider>
          </KeysProvider>
        </ComposerProvider>
      </ToastProvider>
    </LabelsProvider>
  );
}

/** Rewrite an unknown or non-canonical hash (`#`, `#foo`, `#settings`) in place, without a history entry. */
function useCanonicalHash(): void {
  useEffect(() => {
    const fix = () => {
      if (!isCanonicalHash(window.location.hash)) navigate(parseRoute(window.location.hash), { replace: true });
    };
    fix();
    return subscribeRoute(fix);
  }, []);
}

function ShellLayout() {
  useCanonicalHash();
  const route = useRoute();
  const labels = useLabels();
  const online = useOnline();
  const wide = useMediaQuery(WIDE_QUERY, true);
  const phone = useMediaQuery(PHONE_QUERY);
  const [railOnWide, setRailOnWide] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // The drawer mounts a fresh Nav each time it opens: its label tree and scroll live here.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [showHidden, setShowHidden] = useState(false);
  const scrollTop = useRef(0);
  const navMemory: NavMemory = { collapsed, setCollapsed, showHidden, setShowHidden, scrollTop };
  const drawerContent = useRef<HTMLDivElement | null>(null);
  const keepScroll = useCallback((element: HTMLDivElement | null) => {
    drawerContent.current = element;
    if (!element) return;
    // The panel takes its height a moment after it mounts, and a scroll set before is clamped: set it again as it settles.
    const restore = () => {
      element.scrollTop = scrollTop.current;
    };
    restore();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(restore);
    observer?.observe(element);
    const stop = window.setTimeout(() => observer?.disconnect(), 500);
    return () => {
      window.clearTimeout(stop);
      observer?.disconnect();
    };
  }, []);
  /** Close the drawer, noting where it was scrolled to: the next opening starts there. */
  const closeDrawer = () => {
    if (drawerContent.current) scrollTop.current = drawerContent.current.scrollTop;
    setDrawerOpen(false);
  };

  // The navigation inline: names and icons, a rail, or (on a phone) none. Narrower than wide, the menu opens it in a drawer.
  const mode: NavProps["mode"] = wide ? (railOnWide ? "rail" : "expanded") : phone ? "hidden" : "rail";
  const inDrawer = !wide && drawerOpen;

  function toggleNav(): void {
    if (wide) setRailOnWide((r) => !r);
    else if (drawerOpen) closeDrawer();
    else setDrawerOpen(true);
  }

  return (
    <div
      className="grid h-dvh grid-cols-[var(--nav-width)_minmax(0,1fr)] grid-rows-[var(--topbar-height)_minmax(0,1fr)] overflow-hidden bg-canvas [grid-template-areas:'top_top'_'nav_main'] data-[nav=hidden]:grid-cols-[0_minmax(0,1fr)] data-[nav=rail]:grid-cols-[var(--nav-rail-width)_minmax(0,1fr)]"
      data-nav={mode}
    >
      <button
        type="button"
        className="absolute top-2 left-2 z-skip -translate-y-[calc(100%+1rem)] cursor-pointer rounded-md bg-accent px-4 py-2 font-semibold text-on-accent focus-visible:translate-y-0"
        onClick={() => mainRef.current?.focus()}
      >
        Skip to main content
      </button>
      <TopBar route={route} navExpanded={mode === "expanded" || inDrawer} onToggleNav={toggleNav} />
      <NavMemoryProvider memory={navMemory}>
        {mode === "hidden" || inDrawer ? null : (
          <div className="[grid-area:nav] min-h-0 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
            <Nav route={route} mode={mode} />
          </div>
        )}
        <NavDrawer
          open={inDrawer}
          onClose={closeDrawer}
          returnFocus={() => document.querySelector<HTMLElement>('[aria-controls="shell-nav"]')}
          contentRef={keepScroll}
        >
          <Nav route={route} mode="drawer" onNavigate={closeDrawer} />
        </NavDrawer>
      </NavMemoryProvider>
      <div className="[grid-area:main] flex min-h-0 min-w-0 flex-col gap-2 pr-4 pb-4 max-lg:pr-2 max-lg:pb-2 max-sm:p-0">
        <ConnectionBanner
          offline={!online}
          unreachable={labels.status === "ready" && labels.offline}
          onRetry={() => void labels.store.sync()}
        />
        <main
          ref={mainRef}
          id="main"
          className="min-h-0 flex-[1_1_auto] overflow-auto rounded-xl bg-surface focus:outline-none focus-visible:-outline-offset-2 focus-visible:[outline:var(--focus-ring)] max-sm:rounded-t-lg max-sm:rounded-b-none"
          tabIndex={-1}
        >
          <MainArea route={route} />
        </main>
      </div>
      {/* Phones have no navigation on screen, so Compose floats bottom-right. */}
      {phone && !inDrawer ? <PhoneComposeButton route={route} /> : null}
      <div className="pointer-events-none fixed right-4 bottom-0 z-compose flex items-end gap-4 [&>*]:pointer-events-auto">
        <ComposerHost />
      </div>
      <HelpSheet />
      <ShortcutsHost />
    </div>
  );
}
