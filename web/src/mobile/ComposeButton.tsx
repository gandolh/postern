// The floating Compose button on phones (brief 16), bottom-right as in
// Gmail's app: the navigation, which holds Compose on wider screens, is
// hidden there until the menu opens it. Shown over mail lists only; an open
// conversation has Reply and Forward instead.

import { Pencil } from "lucide-react";
import { useCompose } from "../composer";
import type { Route } from "../shell/router";
import "./mobile.css";

export function PhoneComposeButton({ route }: { route: Route }) {
  const compose = useCompose();
  const onList = (route.kind === "system" || route.kind === "label" || route.kind === "search") && !route.conversationId;
  if (!onList) return null;
  return (
    <button type="button" className="mobile-compose" onClick={() => compose.open()}>
      <Pencil aria-hidden="true" />
      <span>Compose</span>
    </button>
  );
}
