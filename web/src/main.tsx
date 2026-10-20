// The theme's CSS goes first, so module CSS (auth.css, shell.css...) comes after it and builds on it.
import "./theme/fonts";
import "./theme/tokens.css";
import "./theme/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerWorker } from "./push/install";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

// The service worker (brief 16): install, offline start, Web Push. It never
// holds a token; there is none under `vite dev`.
registerWorker();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
