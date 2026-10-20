// Accounts: identities and signatures, the default identity (per device),
// storage used, and links to Stalwart's account page.

import type { Identity } from "@postern/jmap";
import { useEffect, useId, useState } from "react";
import { STALWART_ACCOUNT_URL, useAccount, useJmap } from "../auth";
import { setPrefs, usePrefs } from "../prefs";
import { IdentityEditor } from "./IdentityEditor";
import { QuotaBar } from "./QuotaBar";

export function AccountsSettings() {
  const { username } = useAccount();
  return (
    <div className="settings-form">
      <p className="settings-hint">Signed in as {username}.</p>
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
    <section className="settings-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        Send mail as
      </h2>
      {error ? <p role="alert">Could not load your identities: {error}</p> : null}
      {!identities && !error ? <p className="settings-hint">Loading&hellip;</p> : null}
      {identities && identities.length > 1 ? (
        <div className="settings-field">
          <label htmlFor={defaultId} className="settings-label">
            Default identity on this device
          </label>
          <select id={defaultId} className="input settings-select" value={prefs.defaultIdentityId ?? identities[0]!.id} onChange={(e) => setPrefs({ defaultIdentityId: e.target.value })}>
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name ? `${i.name} <${i.email}>` : i.email}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {identities?.map((identity) => <IdentityEditor key={identity.id} identity={identity} />)}
    </section>
  );
}

function AccountLinks() {
  const headingId = useId();
  if (!STALWART_ACCOUNT_URL) return null;
  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        Security
      </h2>
      <p className="settings-hint">Your password, 2-step verification and app passwords are managed on the mail server&rsquo;s account page.</p>
      <ul className="settings-links">
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
