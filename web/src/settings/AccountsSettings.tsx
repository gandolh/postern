// Accounts: identities and signatures, the default identity (per device),
// storage used, and links to Stalwart's account page.

import type { Identity } from "@postern/jmap";
import { useEffect, useId, useState } from "react";
import { STALWART_ACCOUNT_URL, useAccount, useJmap } from "../auth";
import { setPrefs, usePrefs } from "../prefs";
import { IdentityEditor } from "./IdentityEditor";
import { QuotaBar } from "./QuotaBar";
import { inputClass } from "../components/ui/Input";

export function AccountsSettings() {
  const { username } = useAccount();
  return (
    <div className="flex max-w-176 flex-col gap-6 p-6">
      <p className="m-0 text-text-muted">Signed in as {username}.</p>
      <Identities />
      <QuotaBar />
      <AccountLinks />
    </div>
  );
}

function Identities() {
  const client = useJmap();
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { prefs } = usePrefs();
  const headingId = useId();
  const defaultId = useId();

  useEffect(() => {
    const controller = new AbortController();
    client.identity.get({}, { signal: controller.signal }).then(
      (res) => setIdentities(res.list),
      (e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "unknown error");
      },
    );
    return () => controller.abort();
  }, [client]);

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4" aria-labelledby={headingId}>
      <h2 id={headingId} className="m-0 text-lg font-semibold">
        Send mail as
      </h2>
      {error ? <p role="alert">Could not load your identities: {error}</p> : null}
      {!identities && !error ? <p className="m-0 text-text-muted">Loading&hellip;</p> : null}
      {identities && identities.length > 1 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={defaultId} className="m-0 text-md font-semibold">
            Default identity on this device
          </label>
          <select
            id={defaultId}
            className={inputClass("max-w-96")}
            value={prefs.defaultIdentityId ?? identities[0]?.id ?? ""}
            onChange={(e) => setPrefs({ defaultIdentityId: e.target.value })}
          >
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name ? `${i.name} <${i.email}>` : i.email}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {identities?.map((identity) => (
        <IdentityEditor key={identity.id} identity={identity} />
      ))}
    </section>
  );
}

function AccountLinks() {
  const headingId = useId();
  if (!STALWART_ACCOUNT_URL) return null;
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4" aria-labelledby={headingId}>
      <h2 id={headingId} className="m-0 text-lg font-semibold">
        Security
      </h2>
      <p className="m-0 text-text-muted">
        Your password, 2-step verification and app passwords are managed on the mail server&rsquo;s account page.
      </p>
      <ul className="m-0 flex flex-col gap-1 pl-5">
        <li>
          <a href={STALWART_ACCOUNT_URL} target="_blank" rel="noopener noreferrer">
            Change password
          </a>
        </li>
        <li>
          <a href={STALWART_ACCOUNT_URL} target="_blank" rel="noopener noreferrer">
            2-step verification
          </a>
        </li>
        <li>
          <a href={STALWART_ACCOUNT_URL} target="_blank" rel="noopener noreferrer">
            App passwords
          </a>
        </li>
      </ul>
    </section>
  );
}
