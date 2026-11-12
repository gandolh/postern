// The floating Compose button on phones, bottom-right as in
// Gmail's app: the navigation, which holds Compose on wider screens, is
// hidden there until the menu opens it. Shown over mail lists only; an open
// conversation has Reply and Forward instead.

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
      className="fixed right-[calc(1rem+env(safe-area-inset-right,0px))] bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-scrim inline-flex min-h-14 cursor-pointer items-center gap-3 rounded-xl bg-accent-soft pr-5 pl-4 text-md font-semibold text-on-accent-soft shadow-md hover:bg-accent-soft-hover focus-visible:outline-offset-(--focus-offset) focus-visible:[outline:var(--focus-ring)]"
      onClick={() => compose.open()}
    >
      <Pencil aria-hidden="true" />
      <span>Compose</span>
    </button>
  );
}
