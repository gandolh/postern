// Brief 15 replaces this stub with the Contacts page (list, search, add, edit,
// delete). The shell renders it for #contacts.

import { Users } from "lucide-react";
import { EmptyState } from "../shell/states";

export function ContactsRoute() {
  return (
    <section className="shell-page" aria-labelledby="contacts-title">
      <header className="shell-page-header">
        <h1 id="contacts-title" className="shell-page-title">
          Contacts
        </h1>
      </header>
      <EmptyState icon={Users} title="Your contacts appear here" />
    </section>
  );
}
