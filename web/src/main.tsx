// The theme's CSS goes first, so module CSS (auth.css, shell.css...) comes after it and builds on it.
import "./theme/fonts";
import "./theme/tokens.css";
import "./theme/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
