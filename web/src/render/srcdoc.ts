// The message frame: the exact sandbox, and the document that goes into its
// srcdoc. The only way message HTML reaches the screen.
//
//   <iframe sandbox={MESSAGE_FRAME_SANDBOX} srcDoc={buildSrcdoc(clean, view)} referrerPolicy="no-referrer" />
//
// The sandbox has no allow-scripts and no allow-same-origin: the frame
// cannot run script, and its opaque origin cannot reach Postern's. No
// allow-forms, no allow-top-navigation: it cannot post or navigate the app.
// allow-popups (+ escape) lets a link open in a new tab as a normal page.
//
// The document carries its own CSP as defence in depth (the sanitiser has
// already removed every remote URL until "Display images"; this would catch
// a sanitiser miss), a no-referrer policy, Postern's base style, the
// message's sanitised styles, then Postern's overrides.

import { FLAG_ATTR } from "./flag";
import type { SanitizedHtml } from "./sanitize";
import { QUOTE_ATTR } from "./quotes";

/** The sandbox of every message frame. Exactly these two tokens; brief 17 asserts it. */
export const MESSAGE_FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/** The sandbox of the attachment image viewer: nothing at all. */
export const VIEWER_FRAME_SANDBOX = "";

export interface FrameView {
  /** Hide the trailing quote (QUOTE_ATTR). */
  foldQuote: boolean;
  /** The app's theme. A message with its own colours stays light either way. */
  theme: "light" | "dark";
  /** Remote images were restored ("Display images"): the frame's CSP allows https images. */
  allowRemote: boolean;
}

/** The frame's own Content-Security-Policy. */
export function frameCsp(allowRemote: boolean): string {
  return [
    "default-src 'none'",
    `img-src data:${allowRemote ? " https:" : ""}`,
    "style-src 'unsafe-inline'",
    "font-src 'none'",
    "media-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

// The frame cannot see the app's tokens.css: these mirror its surface, text and accent values.
const PALETTE = {
  light: { background: "#ffffff", text: "#18201c", muted: "#4e5853", link: "#1c6a57", border: "#d5dcd8" },
  dark: { background: "#191f1c", text: "#e3e9e5", muted: "#aab5af", link: "#72cbae", border: "#36403b" },
} as const;

/** The frame's font. measure.ts measures text with the same one. */
export const FRAME_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const FRAME_FONT_SIZE = 16;
export const FRAME_LINE_HEIGHT = 1.5;

function baseCss(scheme: "light" | "dark"): string {
  const p = PALETTE[scheme];
  // The first cascade layer: its !important rules beat any the message writes, layered or not.
  return `@layer postern-first;
@layer postern-first{[${FLAG_ATTR}]::before,[${FLAG_ATTR}]::after{content:none!important;display:none!important}}
:root{color-scheme:${scheme}}
html,body{margin:0;padding:0}
body{font-family:${FRAME_FONT_FAMILY};font-size:${FRAME_FONT_SIZE}px;line-height:${FRAME_LINE_HEIGHT};color:${p.text};background:${p.background};overflow-wrap:break-word}
a{color:${p.link}}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap}
blockquote{margin:0 0 0 .8ex;padding-left:1ex;border-left:1px solid ${p.border}}
table{max-width:100%}`;
}

function overridesCss(foldQuote: boolean): string {
  return `html,html body{position:static!important}
html body{overflow:auto!important;min-height:0!important}
${foldQuote ? `[${QUOTE_ATTR}]{display:none!important}` : ""}`;
}

/** The colour scheme the frame uses: a message with its own colours stays light. */
export function frameScheme(clean: Pick<SanitizedHtml, "ownColours">, theme: "light" | "dark"): "light" | "dark" {
  return clean.ownColours ? "light" : theme;
}

/** The srcdoc for a sanitised message. Every piece is either Postern's own text or the sanitiser's output. */
export function buildSrcdoc(clean: Pick<SanitizedHtml, "headHtml" | "bodyHtml" | "ownColours">, view: FrameView): string {
  const scheme = frameScheme(clean, view.theme);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${frameCsp(view.allowRemote)}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="${scheme}">
<style>${baseCss(scheme)}</style>
${clean.headHtml}
<style>${overridesCss(view.foldQuote)}</style>
</head>${clean.bodyHtml}</html>`;
}

/** A plain-text part as HTML, for a message that mixes text and HTML parts. Escaped: text is never markup. */
export function textAsHtml(text: string): string {
  const escaped = text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
  return `<div style="white-space:pre-wrap">${escaped}</div>`;
}
