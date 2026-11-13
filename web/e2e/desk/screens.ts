// One table of screens, shared by the shots, the focus-ring, the reduced-motion and the 390-overflow specs.

import type { Page } from "@playwright/test";

export interface Screen {
  name: string;
  hash: string;
  /** Waits until the screen has drawn. */
  ready: (page: Page) => Promise<void>;
  /** Drawn on the board: shot and compared with its twin. */
  drawn?: boolean;
}

const list = async (page: Page) => {
  await page.locator("[data-row], [role='row'], li").first().waitFor();
};

export const SCREENS: Screen[] = [
  { name: "list", hash: "#inbox", ready: list, drawn: true },
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

export const WIDTHS = [
  { label: "1280", width: 1280, height: 800 },
  { label: "390", width: 390, height: 844 },
] as const;
export const THEMES = ["light", "dark"] as const;
