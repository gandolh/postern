// The floating Compose button on phones, bottom-right above the bottom bar:
// the navigation, which holds Compose on wider screens, is hidden there until
// Labels opens it. Shown over mail lists only; an open conversation has
// Reply and Forward instead. Filled, the screen's one accent button.

import { Pencil } from "lucide-react";
import { useCompose } from "../composer";
import type { Route } from "../shell/router";

export function PhoneComposeButton({ route }: { route: Route }) {
  const compose = useCompose();
  const onList =
    (route.kind === "system" || route.kind === "label" || route.kind === "search") && !route.conversationId;
  if (!onList) return null;
  return (
    <button
      type="button"
      data-compose-fab
      className="fixed right-[calc(1rem+env(safe-area-inset-right,0px))] bottom-[calc(var(--bottombar-height)+1rem+env(safe-area-inset-bottom,0px))] z-card inline-flex min-h-14 cursor-pointer items-center gap-3 rounded-xl bg-accent pr-5 pl-5 text-md font-bold text-on-accent shadow-lg hover:bg-accent-hover focus-visible:[outline:var(--focus-ring)] focus-visible:outline-offset-(--focus-offset)"
      onClick={() => compose.open()}
    >
      <Pencil aria-hidden="true" />
      <span>Compose</span>
    </button>
  );
}
