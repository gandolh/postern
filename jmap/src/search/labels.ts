import type { Id } from "../types/core.js";

/** The typed form of a label name: lower case, with `-`, `_` and spaces alike. */
export function normalizeLabelName(name: string): string {
  return name
    .toLowerCase()
    .split("/")
    .map((part) => part.replace(/[\s_-]+/g, " ").trim())
    .join("/");
}

/**
 * A resolver for `label:` and `in:` from the account's labels (`path` as
 * "Work/Clients"). Case-insensitive; `-` and `_` match spaces, so
 * `label:my-label` finds "My Label" and `label:work/clients` finds a nested
 * one. An exact path wins; otherwise a name that only one label ends with.
 */
export function createLabelResolver(labels: readonly { id: Id; path: string }[]): (name: string) => Id | undefined {
  const byPath = new Map<string, Id>();
  const byLeaf = new Map<string, Id[]>();
  for (const { id, path } of labels) {
    const key = normalizeLabelName(path);
    if (!byPath.has(key)) byPath.set(key, id);
    const leaf = key.slice(key.lastIndexOf("/") + 1);
    byLeaf.set(leaf, [...(byLeaf.get(leaf) ?? []), id]);
  }
  return (name) => {
    const key = normalizeLabelName(name);
    if (key === "") return undefined;
    const exact = byPath.get(key);
    if (exact !== undefined) return exact;
    const leaves = byLeaf.get(key);
    return leaves && leaves.length === 1 ? leaves[0] : undefined;
  };
}
