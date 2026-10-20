// Loads the signed-in account's prefs and applies them. Render it once under
// the session (the shell may mount it; until then SettingsRoutes mounts it
// the moment settings open, and startPrefs() covers the account last seen).

import { useEffect } from "react";
import { useAccount } from "../auth";
import { setPrefsAccount } from "./prefs";

export function PrefsHost() {
  const { username } = useAccount();
  useEffect(() => {
    setPrefsAccount(username);
  }, [username]);
  return null;
}
