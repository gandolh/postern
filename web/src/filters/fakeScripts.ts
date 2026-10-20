// A fake account of Sieve scripts for tests (the SieveIo the filters use).
// Test-only: nothing in the app imports it.

import type { SieveScript } from "@postern/jmap";
import type { SaveScriptArgs, SieveIo } from "./scriptIo";

export class FakeScripts implements SieveIo {
  scripts: (SieveScript & { source: string })[] = [];
  saves: SaveScriptArgs[] = [];
  invalid: string | null = null;
  #next = 1;

  add(name: string, source: string, isActive = false) {
    const id = `S${this.#next++}`;
    if (isActive) for (const s of this.scripts) s.isActive = false;
    this.scripts.push({ id, name, blobId: `B${id}`, isActive, source });
    return id;
  }
  async list() {
    return this.scripts.map(({ source: _source, ...s }) => ({ ...s }));
  }
  async read(script: SieveScript) {
    return this.scripts.find((s) => s.id === script.id)!.source;
  }
  async validate() {
    return this.invalid ? { type: "invalidScript", description: this.invalid } : null;
  }
  async save(args: SaveScriptArgs) {
    this.saves.push(args);
    let id = args.id;
    if (id === null) id = this.add(args.name, args.source);
    else this.scripts.find((s) => s.id === id)!.source = args.source;
    if (args.activate) await this.activate(id);
    return id;
  }
  async activate(id: string) {
    for (const s of this.scripts) s.isActive = s.id === id;
  }
  active() {
    return this.scripts.find((s) => s.isActive)?.name ?? null;
  }
  source(name: string) {
    return this.scripts.find((s) => s.name === name)!.source;
  }
}
