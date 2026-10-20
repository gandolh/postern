// Registers the service worker (brief 16), from main.tsx. Kept apart from
// register.ts because `virtual:pwa-register` exists only inside a Vite build
// with vite-plugin-pwa, not under Vitest.

import { registerSW } from "virtual:pwa-register";
import { listenToWorker, updateWaiting } from "./register";

export function registerWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  listenToWorker();
  const update = registerSW({
    onNeedRefresh() {
      updateWaiting(() => void update(true));
    },
  });
}
