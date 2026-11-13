// One table of screens, shared by the shots, the focus-ring, the reduced-motion and the 390-overflow specs.

import type { Page } from "@playwright/test";
import type { Desk } from "./stub.ts";

export interface Screen {
  name: string;
  hash: string | ((desk: Desk) => string);
  /** Waits until the screen has drawn. */
  ready: (page: Page) => Promise<void>;
  /** Then does something to reach the state (opens a window, a menu). */
  after?: (page: Page) => Promise<void>;
  /** Drawn on the board: shot and compared with its twin. */
  drawn?: boolean;
}

const list = async (page: Page) => {
  await page.locator("[data-row], [role='row'], li").first().waitFor();
};

const conversation = async (page: Page) => {
  await page.locator("[data-conversation-page]").waitFor();
  await page.locator("[data-expanded='true']").first().waitFor();
};

export const SCREENS: Screen[] = [
  { name: "list", hash: "#inbox", ready: list, drawn: true },
  {
    name: "conversation",
    hash: (desk) => `#inbox/${desk.threadBySubject("Saturday plans")}`,
    ready: conversation,
    drawn: true,
  },
  {
    name: "conversation-long",
    hash: (desk) => `#inbox/${desk.threadBySubject("Q4 roadmap review")}`,
    ready: conversation,
    drawn: true,
  },
  {
    name: "composer",
    hash: "#inbox",
    ready: list,
    after: async (page) => {
      await page.getByRole("button", { name: "Compose" }).click();
      await page.locator("dialog[open]").waitFor();
      await page.waitForTimeout(400);
    },
    drawn: true,
  },
  { name: "starred", hash: "#starred", ready: list },
  { name: "sent", hash: "#sent", ready: list },
  {
    name: "settings",
    hash: "#settings/general",
    ready: async (p) => void (await p.getByRole("heading").first().waitFor()),
  },
  { name: "contacts", hash: "#contacts", ready: async (p) => void (await p.getByRole("heading").first().waitFor()) },
  { name: "scheduled", hash: "#scheduled", ready: async (p) => void (await p.getByRole("heading").first().waitFor()) },
];

export function hashOf(screen: Screen, desk: Desk): string {
  return typeof screen.hash === "function" ? screen.hash(desk) : screen.hash;
}

export const WIDTHS = [
  { label: "1280", width: 1280, height: 800 },
  { label: "390", width: 390, height: 844 },
] as const;
export const THEMES = ["light", "dark"] as const;
