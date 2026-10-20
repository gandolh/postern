// Postern's one script among the account's others: what it refuses, what it
// keeps running, and the vacation responder (a fake server of scripts).

import { emptyActions, emptyCriteria, generateSieve, parseFilterScript, withBlocked, type FilterSet, type MailFilter } from "@postern/jmap";
import { describe, expect, it } from "vitest";
import { activateFilters, FilterScriptError, loadFilters, saveFilters } from "./filterScript";
import { FakeScripts } from "./fakeScripts";

const bobFilter: MailFilter = { criteria: { ...emptyCriteria(), from: ["bob@postern.test"] }, actions: { ...emptyActions(), label: { id: "i", name: "Work" }, archive: true } };
const addFilter = (f: MailFilter) => (s: FilterSet): FilterSet => ({ ...s, filters: [...s.filters, f] });

describe("loading", () => {
  it("an account with no scripts has no filters", async () => {
    const io = new FakeScripts();
    expect(await loadFilters(io)).toEqual({ set: { filters: [], blocked: [], includes: [] }, scriptId: null, active: false, otherActive: null, problem: null });
  });

  it("reads Postern's script back", async () => {
    const io = new FakeScripts();
    const set = { filters: [bobFilter], blocked: ["x@y.test"], includes: [] };
    io.add("postern", generateSieve(set), true);
    expect(await loadFilters(io)).toMatchObject({ set, active: true, otherActive: null, problem: null });
  });

  it('flags a "postern" script Postern didn\'t write, and one changed by hand', async () => {
    const foreign = new FakeScripts();
    foreign.add("postern", 'require ["fileinto"];\r\nfileinto "X";\r\n');
    expect((await loadFilters(foreign)).problem).toEqual({ kind: "foreign-name" });
    const edited = new FakeScripts();
    edited.add("postern", generateSieve({ filters: [bobFilter], blocked: [], includes: [] }) + "discard;\r\n");
    expect((await loadFilters(edited)).problem).toMatchObject({ kind: "unreadable" });
  });

  it("says which other script is active, and whether it is the vacation responder", async () => {
    const io = new FakeScripts();
    io.add("vacation", "require \"vacation\";", true);
    expect((await loadFilters(io)).otherActive).toMatchObject({ name: "vacation", vacation: true });
  });
});

describe("saving", () => {
  it("creates Postern's script and makes it the active one", async () => {
    const io = new FakeScripts();
    const outcome = await saveFilters(io, addFilter(bobFilter));
    expect(io.active()).toBe("postern");
    expect(parseFilterScript(io.source("postern")).filters).toEqual([bobFilter]);
    expect(outcome).toMatchObject({ heldByVacation: false, newlyIncluded: null, loaded: { active: true } });
  });

  it("starts from the script on the server, so another device's change is kept", async () => {
    const io = new FakeScripts();
    await saveFilters(io, addFilter(bobFilter));
    // Another device blocks someone meanwhile.
    io.scripts[0]!.source = generateSieve({ filters: [bobFilter], blocked: ["spam@x.test"], includes: [] });
    await saveFilters(io, (s) => withBlocked(s, "other@x.test"));
    expect(parseFilterScript(io.source("postern")).blocked).toEqual(["spam@x.test", "other@x.test"]);
  });

  it("keeps a hand-written active script running by including it, and leaves it in place", async () => {
    const io = new FakeScripts();
    const mine = 'require ["fileinto"];\r\nif header :contains "subject" "x" { fileinto "X"; }\r\n';
    io.add("my rules", mine, true);
    const outcome = await saveFilters(io, addFilter(bobFilter));
    expect(outcome.newlyIncluded).toBe("my rules");
    expect(io.active()).toBe("postern");
    expect(io.source("my rules")).toBe(mine);
    expect(io.source("postern")).toContain('include :personal :optional "my rules";');
    // Saving again doesn't include it twice.
    await saveFilters(io, (s) => s);
    expect(parseFilterScript(io.source("postern")).includes).toEqual(["my rules"]);
  });

  it("doesn't take the slot from the vacation responder: saved, not activated", async () => {
    const io = new FakeScripts();
    io.add("vacation", 'require "vacation";', true);
    const outcome = await saveFilters(io, addFilter(bobFilter));
    expect(outcome.heldByVacation).toBe(true);
    expect(io.active()).toBe("vacation");
    expect(io.saves.at(-1)!.activate).toBe(false);
    expect(io.source("postern")).not.toContain("vacation");
    expect(outcome.loaded).toMatchObject({ active: false, otherActive: { vacation: true } });
  });

  it("turns filters on when asked, which turns the vacation responder off", async () => {
    const io = new FakeScripts();
    io.add("vacation", 'require "vacation";', true);
    await saveFilters(io, addFilter(bobFilter));
    const loaded = await activateFilters(io);
    expect(io.active()).toBe("postern");
    expect(loaded).toMatchObject({ active: true, otherActive: null });
  });

  it('refuses to overwrite a "postern" script Postern didn\'t write', async () => {
    const io = new FakeScripts();
    io.add("postern", 'require ["fileinto"];\r\nfileinto "X";\r\n', true);
    await expect(saveFilters(io, addFilter(bobFilter))).rejects.toThrow(FilterScriptError);
    expect(io.saves).toEqual([]);
    await expect(activateFilters(io)).rejects.toThrow(FilterScriptError);
  });

  it("refuses to overwrite a hand-edited Postern script unless told to start over", async () => {
    const io = new FakeScripts();
    io.add("postern", generateSieve({ filters: [bobFilter], blocked: [], includes: [] }) + "discard;\r\n", true);
    await expect(saveFilters(io, addFilter(bobFilter))).rejects.toThrow(/changed outside Postern/);
    await saveFilters(io, () => ({ filters: [], blocked: [], includes: [] }), { replaceUnreadable: true });
    expect(parseFilterScript(io.source("postern"))).toEqual({ filters: [], blocked: [], includes: [] });
  });

  it("checks each filter, and the server's validation, before writing", async () => {
    const io = new FakeScripts();
    const empty: MailFilter = { criteria: emptyCriteria(), actions: { ...emptyActions(), star: true } };
    await expect(saveFilters(io, addFilter(empty))).rejects.toThrow(/Filter 1: Fill in at least one search criterion/);
    io.invalid = "Unknown capability";
    await expect(saveFilters(io, addFilter(bobFilter))).rejects.toThrow(/refused the filters: Unknown capability/);
    expect(io.saves).toEqual([]);
  });
});
