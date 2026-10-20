// One identity: name, reply-to, text signature, HTML signature. Applies when a
// field loses focus. The HTML signature is edited as plain text; its preview is
// the sanitised document in a sandboxed iframe, never in the app's DOM. The
// composer sanitises it again when it inserts it.

import type { Identity } from "@postern/jmap";
import { useId, useMemo, useState } from "react";
import { useJmap } from "../auth";
import { getComposer } from "../composer/registry";
import { sanitizeMessageHtml } from "../render/sanitize";
import { buildSrcdoc } from "../render/srcdoc";
import { useTheme } from "../theme";
import { useSaved } from "./useSaved";
import { TextField } from "./VacationForm";

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function IdentityEditor({ identity }: { identity: Identity }) {
  const client = useJmap();
  const { note, save } = useSaved();
  const [current, setCurrent] = useState(identity);
  const [replyToError, setReplyToError] = useState(false);
  const id = useId();
  const replyTo = current.replyTo?.[0]?.email ?? "";

  const commit = async (patch: Partial<Pick<Identity, "name" | "replyTo" | "textSignature" | "htmlSignature">>) => {
    setCurrent({ ...current, ...patch });
    const ok = await save(async () => {
      const res = await client.identity.set({ update: { [current.id]: patch } });
      const failure = res.notUpdated?.[current.id];
      if (failure) throw new Error(failure.description ?? failure.type);
    });
    // The composer reads identities once; make its next open read them again.
    if (ok) getComposer()?.refreshIdentities();
  };

  return (
    <fieldset className="settings-identity">
      <legend>{current.email}</legend>
      <TextField id={`${id}-name`} label="Name" value={current.name} onCommit={(name) => void commit({ name })} />
      <div className="settings-field">
        <TextField
          id={`${id}-reply`}
          label="Reply-to address"
          value={replyTo}
          onCommit={(value) => {
            const trimmed = value.trim();
            if (trimmed !== "" && !EMAIL.test(trimmed)) {
              setReplyToError(true);
              return;
            }
            setReplyToError(false);
            void commit({ replyTo: trimmed === "" ? null : [{ name: null, email: trimmed }] });
          }}
        />
        {replyToError ? <p role="alert" className="settings-error">Enter one email address, or leave it empty.</p> : null}
      </div>
      <TextField id={`${id}-text`} label="Signature (plain text)" multiline value={current.textSignature} onCommit={(textSignature) => void commit({ textSignature })} />
      <TextField id={`${id}-html`} label="Signature (HTML, optional)" multiline value={current.htmlSignature} onCommit={(htmlSignature) => void commit({ htmlSignature })} />
      <HtmlPreview html={current.htmlSignature} title={`Preview of the HTML signature for ${current.email}`} />
      {note}
    </fieldset>
  );
}

function HtmlPreview({ html, title }: { html: string; title: string }) {
  const { resolvedTheme } = useTheme();
  const srcdoc = useMemo(() => {
    if (html.trim() === "") return null;
    return buildSrcdoc(sanitizeMessageHtml(html), { foldQuote: false, theme: resolvedTheme, allowRemote: false });
  }, [html, resolvedTheme]);
  if (srcdoc === null) return null;
  return <iframe className="settings-preview" sandbox="" srcDoc={srcdoc} title={title} referrerPolicy="no-referrer" />;
}
