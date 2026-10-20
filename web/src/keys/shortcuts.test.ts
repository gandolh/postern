// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEQUENCE_TIMEOUT_MS, KeyEngine, SHORTCUTS, filterShortcuts, isTypingTarget, tokenOf, type ActionId } from "./shortcuts";

function press(engine: KeyEngine, key: string, init: KeyboardEventInit = {}, target?: Element): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  if (target) Object.defineProperty(event, "target", { value: target });
  return engine.handle(event);
}

function setup(enabled = true) {
  let t = 0;
  const calls: ActionId[] = [];
  const actions: Record<string, () => void> = {};
  for (const s of SHORTCUTS) actions[s.id] = () => void calls.push(s.id);
  const state = { enabled };
  const engine = new KeyEngine(actions, { enabled: () => state.enabled, now: () => t });
  return { engine, calls, state, advance: (ms: number) => (t += ms) };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("single keys", () => {
  it("runs c, /, ? and the list and message keys", () => {
    const { engine, calls } = setup();
    for (const key of ["c", "/", "?", "j", "k", "o", "u", "n", "p", "e", "#", "!", "s", "x", "r", "a", "f", "l", "v", "z"]) {
      expect(press(engine, key, { shiftKey: key === "#" || key === "!" || key === "?" })).toBe(true);
    }
    expect(calls).toEqual(["compose", "search", "help", "next", "previous", "open", "back", "nextMessage", "previousMessage", "archive", "trash", "reportSpam", "star", "select", "reply", "replyAll", "forward", "label", "move", "undo"]);
  });

  it("reads Shift+i, Shift+u, Shift+c, ignoring Caps Lock", () => {
    const { engine, calls } = setup();
    press(engine, "I", { shiftKey: true });
    press(engine, "U", { shiftKey: true });
    press(engine, "C", { shiftKey: true });
    press(engine, "I"); // Caps Lock without Shift is the plain key
    expect(calls).toEqual(["markRead", "markUnread", "composeFullscreen"]);
  });

  it("takes typed punctuation as typed, with or without Shift", () => {
    const { engine, calls } = setup();
    press(engine, "#", { shiftKey: false, altKey: false });
    press(engine, "?", { shiftKey: true });
    press(engine, "!", { shiftKey: false });
    expect(calls).toEqual(["trash", "help", "reportSpam"]);
  });

  it("ignores unknown keys and bare modifiers", () => {
    const { engine, calls } = setup();
    expect(press(engine, "q")).toBe(false);
    expect(press(engine, "Shift", { shiftKey: true })).toBe(false);
    expect(tokenOf({ key: "Dead", shiftKey: false })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("does not repeat one-shot actions when a key is held", () => {
    const { engine, calls } = setup();
    press(engine, "e", { repeat: true });
    press(engine, "j", { repeat: true });
    expect(calls).toEqual(["next"]);
  });

  it("leaves a run that returns false unhandled", () => {
    const engine = new KeyEngine({ compose: () => false }, { enabled: () => true });
    expect(press(engine, "c")).toBe(false);
  });
});

describe("sequences", () => {
  it("g then i / s / t / d / a go to the views", () => {
    const { engine, calls } = setup();
    for (const second of ["i", "s", "t", "d", "a"]) {
      expect(press(engine, "g")).toBe(true);
      expect(press(engine, second)).toBe(true);
    }
    expect(calls).toEqual(["goInbox", "goStarred", "goSent", "goDrafts", "goAll"]);
  });

  it("gives up after the timeout", () => {
    const { engine, calls, advance } = setup();
    press(engine, "g");
    advance(SEQUENCE_TIMEOUT_MS + 1);
    // "i" alone is Shift+i's lower-case twin: nothing
    expect(press(engine, "i")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("still completes inside the timeout", () => {
    const { engine, calls, advance } = setup();
    press(engine, "g");
    advance(SEQUENCE_TIMEOUT_MS - 1);
    press(engine, "i");
    expect(calls).toEqual(["goInbox"]);
  });

  it("a wrong second key cancels without running anything", () => {
    const { engine, calls } = setup();
    press(engine, "g");
    expect(press(engine, "e")).toBe(false);
    expect(calls).toEqual([]);
    // and the sequence is over: i alone does nothing
    expect(press(engine, "i")).toBe(false);
  });

  it("g g starts again", () => {
    const { engine, calls } = setup();
    press(engine, "g");
    press(engine, "g");
    press(engine, "s");
    expect(calls).toEqual(["goStarred"]);
  });

  it("typing in a field between the keys cancels it", () => {
    const { engine, calls } = setup();
    const input = document.createElement("input");
    document.body.append(input);
    press(engine, "g");
    press(engine, "x", {}, input);
    press(engine, "i");
    expect(calls).toEqual([]);
  });
});

describe("guards", () => {
  it("never fires in an input, textarea, select or contentEditable", () => {
    const { engine, calls } = setup();
    document.body.innerHTML = `<input id="a"><textarea id="b"></textarea><select id="c"><option>x</option></select><div id="d" contenteditable="true"><span id="e">hi</span></div>`;
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(press(engine, "c", {}, document.getElementById(id)!)).toBe(false);
      expect(press(engine, "?", { shiftKey: true }, document.getElementById(id)!)).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it("stays off inside the composer, menus, dialogs and the hover card", () => {
    const { engine, calls } = setup();
    document.body.innerHTML = `<div data-compose-key="k"><button id="a">x</button></div><div role="menu"><button id="b">x</button></div><div role="dialog"><button id="c">x</button></div><div class="contacts-hovercard"><button id="d">x</button></div>`;
    for (const id of ["a", "b", "c", "d"]) expect(press(engine, "e", {}, document.getElementById(id)!)).toBe(false);
    expect(calls).toEqual([]);
    expect(isTypingTarget(document.body)).toBe(false);
  });

  it("fires on a button in the list", () => {
    const { engine, calls } = setup();
    document.body.innerHTML = `<div role="grid"><div role="row" id="r"></div></div>`;
    expect(press(engine, "e", {}, document.getElementById("r")!)).toBe(true);
    expect(calls).toEqual(["archive"]);
  });

  it("never fires with Ctrl, Alt or Meta held", () => {
    const { engine, calls } = setup();
    press(engine, "c", { ctrlKey: true });
    press(engine, "e", { altKey: true });
    press(engine, "j", { metaKey: true });
    press(engine, "Enter", { ctrlKey: true });
    expect(calls).toEqual([]);
  });

  it("a held modifier cancels a half-typed sequence", () => {
    const { engine, calls } = setup();
    press(engine, "g");
    press(engine, "i", { ctrlKey: true });
    press(engine, "i");
    expect(calls).toEqual([]);
  });

  it("does nothing when shortcuts are off in settings, and works again when on", () => {
    const { engine, calls, state } = setup(false);
    expect(press(engine, "c")).toBe(false);
    press(engine, "g");
    press(engine, "i");
    expect(calls).toEqual([]);
    state.enabled = true;
    press(engine, "c");
    expect(calls).toEqual(["compose"]);
  });

  it("skips events another handler already took", () => {
    const { engine, calls } = setup();
    const event = new KeyboardEvent("keydown", { key: "c", cancelable: true });
    event.preventDefault();
    expect(engine.handle(event)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("swallows an action's rejected promise", async () => {
    const spy = vi.fn(() => Promise.reject(new Error("no")));
    const engine = new KeyEngine({ archive: spy }, { enabled: () => true });
    expect(press(engine, "e")).toBe(true);
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });
});

describe("help sheet search", () => {
  it("lists every group when the box is empty", () => {
    expect(filterShortcuts("").map((g) => g.group)).toEqual(["Navigation", "Application", "Conversations", "Composing"].filter((g) => SHORTCUTS.some((s) => s.group === g)));
    expect(filterShortcuts("").flatMap((g) => g.items).length).toBe(SHORTCUTS.length);
  });

  it("finds by description, key and sequence", () => {
    expect(filterShortcuts("archive").flatMap((g) => g.items.map((s) => s.id))).toContain("archive");
    expect(filterShortcuts("spam").flatMap((g) => g.items.map((s) => s.id))).toEqual(["reportSpam"]);
    expect(filterShortcuts("g s").flatMap((g) => g.items.map((s) => s.id))).toContain("goStarred");
    expect(filterShortcuts("shift i").flatMap((g) => g.items.map((s) => s.id))).toContain("markRead");
    expect(filterShortcuts("#").flatMap((g) => g.items.map((s) => s.id))).toEqual(["trash"]);
  });

  it("drops empty groups and returns nothing for a miss", () => {
    expect(filterShortcuts("zzzz")).toEqual([]);
    expect(filterShortcuts("reply").every((g) => g.group === "Composing")).toBe(true);
  });
});
