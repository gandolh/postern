// React access to labelPrefs.ts for the signed-in account.
//
//   useLabelPrefs()      { prefs, setPref(labelId, patch) }, re-rendering on change
//   useLabelColor(id)    a label's palette key or undefined (chips, the navigation)

import type { Id } from "@postern/jmap";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAccount } from "../auth";
import { getLabelPrefs, setLabelPref, subscribeLabelPrefs, type LabelColor, type LabelPrefPatch, type LabelPrefs } from "./labelPrefs";

export function useLabelPrefs(): { prefs: LabelPrefs; setPref: (labelId: Id, patch: LabelPrefPatch) => void } {
  const { username } = useAccount();
  const prefs = useSyncExternalStore(
    subscribeLabelPrefs,
    () => getLabelPrefs(username),
    () => getLabelPrefs(username),
  );
  const setPref = useCallback((labelId: Id, patch: LabelPrefPatch) => setLabelPref(username, labelId, patch), [username]);
  return useMemo(() => ({ prefs, setPref }), [prefs, setPref]);
}

export function useLabelColor(labelId: Id): LabelColor | undefined {
  const { prefs } = useLabelPrefs();
  return prefs[labelId]?.color;
}
