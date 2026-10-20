// The app shell (brief 05): Gmail's arrangement in Postern's own face. A top
// bar, the navigation with Compose and the labels, and the main panel; the
// composer layer bottom-right and the toast bottom-left.
//
// It renders the later briefs' components from their own folders (list,
// conversation, search, settings, contacts, composer, keys, live) and never
// needs editing when they land. Rendered by App inside <SessionProvider>, so
// everything here goes on sign-out.

import { useEffect, useRef, useState } from "react";
import { ComposerHost, ComposerProvider } from "../composer";
import { HelpSheet, KeysProvider, ShortcutsHost } from "../keys";
import { LabelsProvider, useLabels } from "../labels/useLabels";
import { LiveHost } from "../live/LiveHost";
import { PrefsHost } from "../prefs";
import { PushHost } from "../push/PushHost";
import { PhoneComposeButton } from "../mobile";
import { PHONE_QUERY, WIDE_QUERY } from "./breakpoints";
import { MainArea } from "./MainArea";
import { Nav, type NavProps } from "./Nav";
import { isCanonicalHash, navigate, parseRoute, subscribeRoute, useRoute } from "./router";
import "./shell.css";
import { ConnectionBanner, useOnline } from "./states";
import { StatusSlotProvider } from "./status";
import { ToastProvider } from "./toast";
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
  const navRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const mode: NavProps["mode"] = wide ? (railOnWide ? "rail" : "expanded") : drawerOpen ? "drawer" : phone ? "hidden" : "rail";

  function toggleNav(): void {
    if (wide) setRailOnWide((r) => !r);
    else setDrawerOpen((o) => !o);
  }

  // The drawer: focus moves into it, Escape closes it.
  useEffect(() => {
    if (mode !== "drawer") return;
    navRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
      document.querySelector<HTMLElement>('[aria-controls="shell-nav"]')?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  return (
    <div className="shell" data-nav={mode}>
      <button type="button" className="shell-skip" onClick={() => mainRef.current?.focus()}>
        Skip to main content
      </button>
      <TopBar route={route} navExpanded={mode === "expanded" || mode === "drawer"} onToggleNav={toggleNav} />
      <div ref={navRef} className="shell-nav-frame">
        <Nav route={route} mode={mode} onNavigate={() => setDrawerOpen(false)} />
      </div>
      {mode === "drawer" ? <div className="shell-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} /> : null}
      <div className="shell-main-column" inert={mode === "drawer"}>
        <ConnectionBanner
          offline={!online}
          unreachable={labels.status === "ready" && labels.offline}
          onRetry={() => void labels.store.sync()}
        />
        <main ref={mainRef} id="main" className="shell-main" tabIndex={-1}>
          <MainArea route={route} />
        </main>
      </div>
      {/* Brief 16: phones have no navigation on screen, so Compose floats bottom-right. */}
      {phone && mode === "hidden" ? <PhoneComposeButton route={route} /> : null}
      <div className="shell-compose-layer">
        <ComposerHost />
      </div>
      <HelpSheet />
      <ShortcutsHost />
    </div>
  );
}
