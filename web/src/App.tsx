// The app: the theme around everything (the sign-in page too), the session,
// and the shell once signed in.

import { SessionProvider } from "./auth";
import { Shell } from "./shell/Shell";
import { ThemeProvider } from "./theme";

export function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </ThemeProvider>
  );
}
