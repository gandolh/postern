// What the filters need from the server, in four calls: list the Sieve
// scripts, read one's source, validate a source, and save one (creating or
// replacing Postern's script, optionally activating it). An interface so the
// rules in ./filterScript.ts are tested without a server.

import type { Id, JmapClient, SetError, SieveScript } from "@postern/jmap";

export interface SaveScriptArgs {
  /** Postern's script, to replace; null to create it. */
  id: Id | null;
  name: string;
  source: string;
  /** Make it the active script (JMAP for Sieve allows one). */
  activate: boolean;
}

export interface SieveIo {
  list(signal?: AbortSignal): Promise<SieveScript[]>;
  read(script: SieveScript, signal?: AbortSignal): Promise<string>;
  /** null when the server accepts the source, else its error. */
  validate(source: string, signal?: AbortSignal): Promise<SetError | null>;
  /** Resolves with the script's id. Rejects with SieveSaveError when the server refuses. */
  save(args: SaveScriptArgs, signal?: AbortSignal): Promise<Id>;
  /** Activate a script already saved. */
  activate(id: Id, signal?: AbortSignal): Promise<void>;
}

/** The server refused to store or activate the script. */
export class SieveSaveError extends Error {
  readonly error: SetError | null;
  constructor(message: string, error: SetError | null = null) {
    super(message);
    this.name = "SieveSaveError";
    this.error = error;
  }
}

/** The SieveIo of a signed-in client. */
export function jmapSieveIo(client: JmapClient): SieveIo {
  return {
    async list(signal) {
      return (await client.sieveScript.get({}, { signal })).list;
    },
    async read(script, signal) {
      const res = await client.blob.download({ blobId: script.blobId, name: `${script.name ?? "script"}.sieve`, type: "text/plain" }, { signal });
      return res.text();
    },
    validate(source, signal) {
      return client.sieveScript.validateSource(source, { signal });
    },
    async save({ id, name, source, activate }, signal) {
      const { blobId } = await client.blob.upload(source, { type: "application/sieve", signal });
      const res = await client.sieveScript.set(
        id === null
          ? { create: { postern: { name, blobId } }, ...(activate ? { onSuccessActivateScript: "#postern" } : {}) }
          : { update: { [id]: { blobId } }, ...(activate ? { onSuccessActivateScript: id } : {}) },
        { signal },
      );
      const refused = res.notCreated?.["postern"] ?? (id !== null ? res.notUpdated?.[id] : undefined);
      if (refused) throw new SieveSaveError(refused.description ?? `The server refused the script (${refused.type}).`, refused);
      const saved = id ?? res.created?.["postern"]?.id;
      if (!saved) throw new SieveSaveError("The server didn't say what it did with the script.");
      return saved;
    },
    async activate(id, signal) {
      const res = await client.sieveScript.set({ onSuccessActivateScript: id }, { signal });
      const refused = res.notUpdated?.[id];
      if (refused) throw new SieveSaveError(refused.description ?? `The server refused to turn the filters on (${refused.type}).`, refused);
    },
  };
}
