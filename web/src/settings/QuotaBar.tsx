// Storage used out of the account's quota (Quota/get), as a bar. With no quota,
// the used amount when the server reports one, else "No storage limit".

import type { Quota } from "@postern/jmap";
import { useEffect, useId, useState } from "react";
import { useJmap } from "../auth";
import { serverHas } from "./capability";

const QUOTA_CAPABILITY = "urn:ietf:params:jmap:quota";

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/** The quota that limits stored mail: an octets quota on the account (else the first octets one). */
export function pickStorageQuota(list: readonly Quota[]): Quota | undefined {
  const octets = list.filter((q) => q.resourceType === "octets");
  return octets.find((q) => q.scope === "account") ?? octets[0];
}

export function QuotaBar() {
  const client = useJmap();
  const supported = serverHas(client, QUOTA_CAPABILITY);
  const [state, setState] = useState<{ quota: Quota | undefined } | "error" | null>(null);
  const headingId = useId();

  useEffect(() => {
    if (!supported) return;
    const controller = new AbortController();
    client.quota.get({}, { signal: controller.signal }).then(
      (res) => setState({ quota: pickStorageQuota(res.list) }),
      () => {
        if (!controller.signal.aborted) setState("error");
      },
    );
    return () => controller.abort();
  }, [client, supported]);

  const quota = state && state !== "error" ? state.quota : undefined;
  const limit = quota && quota.hardLimit > 0 ? quota.hardLimit : 0;
  const percent = quota && limit ? Math.min(100, Math.round((quota.used / limit) * 100)) : 0;

  let body;
  if (!supported) body = <p className="settings-hint">No storage limit.</p>;
  else if (state === null) body = <p className="settings-hint">Loading&hellip;</p>;
  else if (state === "error") body = <p className="settings-hint">Storage use is not available right now.</p>;
  else if (!quota) body = <p className="settings-hint">No storage limit.</p>;
  else if (!limit) body = <p className="settings-hint">{formatBytes(quota.used)} used. No storage limit.</p>;
  else
    body = (
      <>
        <p>
          {formatBytes(quota.used)} of {formatBytes(limit)} used ({percent}%)
        </p>
        <div className="settings-meter" role="meter" aria-labelledby={headingId} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(quota.used, limit)} aria-valuetext={`${formatBytes(quota.used)} of ${formatBytes(limit)} used`} data-high={percent >= 90 ? "true" : undefined}>
          <div className="settings-meter-fill" style={{ width: `${percent}%` }} />
        </div>
      </>
    );

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        Storage
      </h2>
      {body}
    </section>
  );
}
