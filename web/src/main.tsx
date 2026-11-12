import "./styles/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerWorker } from "./push/install";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

// The service worker: install, offline start, Web Push. It never
// holds a token; there is none under `vite dev`.
registerWorker();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
