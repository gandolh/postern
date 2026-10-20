import type { JmapClient } from "@postern/jmap";

/** Does the server offer this capability? False when the session is not readable (a partial client in a test). */
export function serverHas(client: JmapClient, urn: string): boolean {
  try {
    return client.session.hasCapability(urn);
  } catch {
    return false;
  }
}
