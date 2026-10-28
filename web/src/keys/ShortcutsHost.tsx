// The global shortcut listener (brief 14). The shell renders it once; it binds
// the registry in ./shortcuts to the list, conversation and composer controllers.

import { useEffect, useRef, useState } from "react";
import { composeNew, composeFromConversation } from "../composer";
import { getActiveConversation } from "../conversation";
import { LabelMenuPopover } from "../labels/LabelMenu";
import { getActiveList, undoLast } from "../list";
import { getShortcutsEnabled, subscribeShortcutsEnabled } from "../prefs";
import { focusSearch } from "../search";
import { getRoute, isMailRoute, navigate, subscribeRoute, withoutConversation, type LabelRoute, type SystemView } from "../shell/router";
import { useHelpSheet } from "./helpSheet";
import { KeyEngine, type KeyActions } from "./shortcuts";

interface MenuState {
  mode: "label" | "move";
  conversationIds: string[];
  emailIds: string[];
  current: LabelRoute | null;
}

function currentLabelRoute(): LabelRoute | null {
  const route = getRoute();
  if (!isMailRoute(route) || route.kind === "search") return null;
  return withoutConversation(route) as LabelRoute;
}

/** `g` then a letter: a system view. */
function go(view: SystemView): boolean {
  navigate({ kind: "system", view });
  return true;
}

export function ShortcutsHost() {
  const help = useHelpSheet();
  const helpRef = useRef(help);
  useEffect(() => {
    helpRef.current = help;
  });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    /** The conversation acts when the key was pressed inside it, or no list is on screen. */
    function conversationFirst(target: EventTarget | null): boolean {
      const conversation = getActiveConversation();
      if (!conversation) return false;
      if (!getActiveList()) return true;
      return target instanceof Element && target.closest(".conv-page") !== null;
    }

    let lastTarget: EventTarget | null = null;

    async function openMenu(mode: "label" | "move"): Promise<boolean> {
      const conversation = getActiveConversation();
      const list = getActiveList();
      let conversationIds: string[];
      // One message shown alone (brief 26) is labelled alone, by its own id.
      if (conversationFirst(lastTarget) && conversation) conversationIds = [conversation.messageId ?? conversation.conversationId];
      else {
        if (!list) return false;
        conversationIds = (await list.targets()).map((r) => r.id);
        if (conversationIds.length === 0) return false;
      }
      menuOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMenu({ mode, conversationIds, emailIds: [], current: currentLabelRoute() });
      return true;
    }

    const onList = (run: (list: NonNullable<ReturnType<typeof getActiveList>>) => unknown) => () => {
      const list = getActiveList();
      if (!list) return false;
      return run(list) as boolean | void;
    };
    // Conversation keys first; where there is none (or the key was pressed in the list pane) the list's.
    const either =
      (conv: (c: NonNullable<ReturnType<typeof getActiveConversation>>) => unknown, list: (l: NonNullable<ReturnType<typeof getActiveList>>) => unknown) =>
      () => {
        const c = getActiveConversation();
        if (c && conversationFirst(lastTarget)) {
          conv(c);
          return true;
        }
        const l = getActiveList();
        if (!l) return false;
        list(l);
        return true;
      };
    // Brief 26: in a reader showing one message alone, `j` / `k` open the next / previous message row.
    const readerRowOr =
      (delta: 1 | -1, otherwise: () => boolean | void) =>
      (): boolean | void => {
        const c = getActiveConversation();
        if (c?.openRow && conversationFirst(lastTarget)) {
          c.openRow(delta);
          return true;
        }
        return otherwise();
      };
    const conversationOnly = (run: (c: NonNullable<ReturnType<typeof getActiveConversation>>) => unknown) => () => {
      const c = getActiveConversation();
      if (!c) return false;
      run(c);
      return true;
    };

    const actions: KeyActions = {
      compose: () => composeNew(),
      composeFullscreen: () => composeNew({ display: "fullscreen" }),
      search: () => focusSearch(),
      help: () => {
        helpRef.current.open();
        return true;
      },
      undo: () => {
        void undoLast();
        return true;
      },
      next: readerRowOr(1, onList((l) => l.moveFocus(1))),
      previous: readerRowOr(-1, onList((l) => l.moveFocus(-1))),
      select: onList((l) => l.toggleSelect()),
      star: onList((l) => l.toggleStar()),
      markRead: onList((l) => l.markRead()),
      markImportant: onList((l) => l.markImportant()),
      markNotImportant: onList((l) => l.markNotImportant()),
      open: () => {
        const c = getActiveConversation();
        if (c && conversationFirst(lastTarget)) {
          c.toggleMessage();
          return true;
        }
        const l = getActiveList();
        if (!l) return false;
        l.open();
        return true;
      },
      back: conversationOnly((c) => c.back()),
      nextMessage: conversationOnly((c) => c.nextMessage()),
      previousMessage: conversationOnly((c) => c.previousMessage()),
      reply: () => composeFromConversation("reply"),
      replyAll: () => composeFromConversation("replyAll"),
      forward: () => composeFromConversation("forward"),
      archive: either((c) => c.archive(), (l) => l.archive()),
      trash: either((c) => c.trash(), (l) => l.trash()),
      reportSpam: either((c) => c.reportSpam(), (l) => l.reportSpam()),
      markUnread: either((c) => c.markUnread(), (l) => l.markUnread()),
      label: () => openMenu("label"),
      move: () => openMenu("move"),
      goInbox: () => go("inbox"),
      goStarred: () => go("starred"),
      goSent: () => go("sent"),
      goDrafts: () => go("drafts"),
      goAll: () => go("all"),
    };

    const engine = new KeyEngine(actions, { enabled: getShortcutsEnabled });
    const onKeyDown = (event: KeyboardEvent) => {
      lastTarget = event.target;
      if (engine.handle(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    const stopRoute = subscribeRoute(() => engine.reset());
    const stopEnabled = subscribeShortcutsEnabled(() => engine.reset());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      stopRoute();
      stopEnabled();
    };
  }, []);

  function closeMenu(): void {
    setMenu(null);
    const opener = menuOpener.current;
    menuOpener.current = null;
    // The row the menu was opened from may have re-rendered; fall back to leaving focus where React put it.
    if (opener?.isConnected) opener.focus();
  }

  return menu ? <LabelMenuPopover open onClose={closeMenu} {...menu} /> : null;
}
