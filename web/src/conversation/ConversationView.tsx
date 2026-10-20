// Brief 07 replaces this stub with the conversation view.
//
// The shell renders it for #<label>/<conversationId> and
// #search/<query>/<conversationId>: full width when the reading pane is off,
// beside or below the list when it is on (brief 12's setting).

import { ArrowLeft } from "lucide-react";
import type { ResolvedLabel } from "../labels/labelsStore";
import { IconButton } from "../shell/IconButton";
import { formatRoute, withoutConversation, type MailRoute } from "../shell/router";

export interface ConversationViewProps {
  /** Where it was opened from; `route.conversationId` equals `conversationId`. */
  route: MailRoute;
  /** The JMAP Thread id. */
  conversationId: string;
  /** The label it was opened from, or null when opened from search results. */
  label: ResolvedLabel | null;
}

export function ConversationView({ route, conversationId, label }: ConversationViewProps) {
  const back = label ? `Back to ${label.title}` : "Back to search results";
  return (
    <section className="shell-page" aria-labelledby="conversation-title">
      <header className="shell-page-header">
        <IconButton label={back} icon={ArrowLeft} href={formatRoute(withoutConversation(route))} />
        <h1 id="conversation-title" className="shell-page-title">
          Conversation
        </h1>
      </header>
      <p className="shell-page-body">
        Conversation <code>{conversationId}</code> opens here.
      </p>
    </section>
  );
}
