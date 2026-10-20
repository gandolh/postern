// The message HTML sanitiser: DOMPurify plus Postern's rules, run on a
// detached document (DOMPurify parses with DOMParser; nothing here touches
// the app's DOM). The output only ever reaches the screen through
// buildSrcdoc() and a sandboxed <iframe srcdoc> (./srcdoc.ts).
//
//   const clean = sanitizeMessageHtml(html, { allowRemote: false, cidUrls });
//   clean.blockedRemote   remote images left out (the "Images are not displayed" bar)
//   clean.hasQuote        a trailing quote was marked (the "…" toggle)
//   clean.suspiciousLinks links whose text names another host, or look-alike hosts (./idn.ts)
//
// Rules, beyond DOMPurify's defaults (no script, no event handlers, no
// javascript: URLs):
//   - HTML only: inline SVG and MathML are dropped (as Gmail does), and with
//     them the namespace tricks most sanitiser bypasses need;
//   - no forms or form controls, frames, objects, embeds, base, meta, link,
//     template, dialog, audio or video;
//   - links keep http, https and mailto (and #fragments) only, and open in a
//     new tab with rel="noopener noreferrer";
//   - images: cid: becomes the part's data: URL (raster types only), data:
//     raster images stay, remote ones are blocked until `allowRemote`, then
//     upgraded to https; relative URLs are dropped (in a srcdoc frame they
//     would resolve against Postern's own address);
//   - CSS goes through sanitizeCss() (./css.ts) in <style> and style="".
// Restoring images is the same call with `allowRemote: true`.

import createDOMPurify, { type Config, type DOMPurify, type UponSanitizeAttributeHookEvent } from "dompurify";
import { sanitizeCss, setsColours } from "./css";
import { FLAG_ATTR, FLAG_STYLE } from "./flag";
import { lookalikeHost } from "./idn";
import { markQuote, QUOTE_ATTR } from "./quotes";
import { imageUrl, linkHost, rewriteSrcset, safeLinkUrl } from "./urls";

export interface SanitizeOptions {
  /** Load remote images (after "Display images"). Default false. */
  allowRemote?: boolean;
  /** Bare Content-ID → data: URL, for the message's own inline images. */
  cidUrls?: ReadonlyMap<string, string>;
}

/** A link worth warning about. */
export interface SuspiciousLink {
  /** What the message shows. */
  text: string;
  /** Where it really goes (the host, punycode as sent). */
  host: string;
  /**
   * The text names another host, or the host is written to pass for another:
   * scripts mixed in one label, or all letters imitating Latin ones
   * (./idn.ts). An ordinary internationalised name is not flagged.
   */
  reason: "mismatch" | "lookalike";
}

export interface SanitizedHtml {
  /** The message's <style> blocks from its <head>, sanitised, serialised. */
  headHtml: string;
  /** The sanitised <body> element, serialised. */
  bodyHtml: string;
  /**
   * The sanitised document itself, detached (never inserted anywhere): read it
   * to estimate the frame's height (./measure.ts).
   */
  body: HTMLElement;
  /** Remote URLs left out because remote content is blocked. 0 means no bar. */
  blockedRemote: number;
  /** A trailing quote is marked with QUOTE_ATTR. */
  hasQuote: boolean;
  suspiciousLinks: SuspiciousLink[];
  /** The message sets its own colours: keep it on a light background in dark mode. */
  ownColours: boolean;
}

/** Elements that never survive, whatever DOMPurify's profile allows. */
export const FORBIDDEN_TAGS = [
  "script",
  "noscript",
  "base",
  "meta",
  "link",
  "title",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "portal",
  "fencedframe",
  "form",
  "input",
  "button",
  "select",
  "option",
  "optgroup",
  "datalist",
  "textarea",
  "output",
  "keygen",
  "template",
  "slot",
  "shadow",
  "content",
  "element",
  "decorator",
  "dialog",
  "menuitem",
  "audio",
  "video",
  "track",
  "svg",
  "math",
] as const;

/** Attributes that never survive. */
export const FORBIDDEN_ATTRS = [
  "autofocus",
  "ping",
  "download",
  "action",
  "formaction",
  "method",
  "enctype",
  "target",
  "srcdoc",
  "popover",
  "popovertarget",
  "popovertargetaction",
  "command",
  "commandfor",
  "contenteditable",
  "accesskey",
  "integrity",
  "nonce",
  "crossorigin",
  "autoplay",
  "lowsrc",
  "dynsrc",
  "longdesc",
] as const;

const CONFIG: Config & { RETURN_DOM: true } = {
  WHOLE_DOCUMENT: true,
  RETURN_DOM: true,
  USE_PROFILES: { html: true },
  FORBID_TAGS: [...FORBIDDEN_TAGS],
  FORBID_ATTR: [...FORBIDDEN_ATTRS],
  KEEP_CONTENT: true,
  ALLOW_DATA_ATTR: true,
};

/** Attributes the browser fetches as an image. */
const IMAGE_ATTRS = new Set(["src", "background", "poster"]);
/** Attributes that are links (followed on click, not fetched). */
const LINK_ATTRS = new Set(["href", "cite"]);

interface RunState {
  options: SanitizeOptions;
  blocked: number;
  ownColours: boolean;
}

let purifier: DOMPurify | null = null;
let run: RunState | null = null;

function state(): RunState {
  if (!run) throw new Error("sanitize hook outside a run");
  return run;
}

function onAttribute(node: Element, data: UponSanitizeAttributeHookEvent): void {
  const s = state();
  const name = data.attrName;
  const value = data.attrValue;
  const ctx = { allowRemote: s.options.allowRemote === true, cidUrls: s.options.cidUrls };

  // Postern's own markers are Postern's: a message cannot pre-mark itself as a
  // quote, draw Postern's link pill, or reach Postern's elements by class or id.
  if (name.startsWith("data-postern")) {
    data.keepAttr = false;
    return;
  }
  if (name === "class") {
    const kept = value.split(/\s+/).filter((c) => c !== "" && !/^postern/i.test(c));
    if (kept.length === 0) data.keepAttr = false;
    else data.attrValue = kept.join(" ");
    return;
  }
  if (name === "id" && /^\s*postern/i.test(value)) {
    data.keepAttr = false;
    return;
  }
  if (name === "style") {
    data.attrValue = sanitizeCss(value, { ...ctx, onBlocked: () => s.blocked++ });
    if (setsColours(data.attrValue)) s.ownColours = true;
    return;
  }
  if (name === "bgcolor" || name === "color" || name === "text") {
    s.ownColours = true;
    return;
  }
  if (name === "srcset") {
    const next = rewriteSrcset(value, ctx, () => s.blocked++);
    if (next === null) data.keepAttr = false;
    else data.attrValue = next;
    return;
  }
  if (IMAGE_ATTRS.has(name)) {
    const decision = imageUrl(value, ctx);
    if (decision.kind === "blocked") s.blocked++;
    if (decision.kind === "keep") data.attrValue = decision.url;
    else data.keepAttr = false;
    return;
  }
  if (LINK_ATTRS.has(name)) {
    const tag = node.nodeName.toLowerCase();
    const url = tag === "a" || tag === "area" ? safeLinkUrl(value) : name === "cite" ? safeLinkUrl(value) : null;
    if (url === null) data.keepAttr = false;
    else data.attrValue = url;
    return;
  }
  if (name === "usemap" && !/^#[\w-]+$/.test(value.trim())) data.keepAttr = false;
}

function onElement(node: Node, data: { tagName: string }): void {
  if (data.tagName !== "style") return;
  const s = state();
  s.ownColours = true;
  node.textContent = sanitizeCss(node.textContent ?? "", {
    allowRemote: s.options.allowRemote === true,
    cidUrls: s.options.cidUrls,
    onBlocked: () => s.blocked++,
  });
}

function afterAttributes(node: Node): void {
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.nodeName.toLowerCase();
  if ((tag === "a" || tag === "area") && el.hasAttribute("href")) {
    if ((el.getAttribute("href") ?? "").startsWith("#")) return;
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
  }
}

function getPurifier(): DOMPurify {
  if (purifier) return purifier;
  const p = createDOMPurify(window);
  p.addHook("uponSanitizeAttribute", onAttribute);
  p.addHook("uponSanitizeElement", onElement);
  p.addHook("afterSanitizeAttributes", afterAttributes);
  purifier = p;
  return p;
}

// ---- Links -------------------------------------------------------------------

const COMMON_TLDS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "int", "io", "co", "app", "dev", "info", "biz", "me", "us", "uk", "de", "fr",
  "es", "it", "nl", "be", "ch", "at", "ro", "eu", "ca", "au", "nz", "jp", "cn", "in", "br", "ru", "pl", "se", "no", "dk",
  "fi", "ie", "pt", "gr", "cz", "hu", "sk", "bg", "md", "ua", "tr", "il", "za", "mx", "ar", "cl", "kr", "sg", "hk", "tw",
  "test", "example",
]);

/** The host a link's text claims, if the text reads like an address. */
function claimedHost(text: string): string | null {
  const t = text.trim();
  const explicit = /\b(?:https?:\/\/|www\.)([^\s/?#<>"'(),]+)/i.exec(t);
  let candidate: string | null = null;
  if (explicit) {
    candidate = explicit[0].toLowerCase().startsWith("www.") ? `www.${explicit[1]}` : (explicit[1] as string);
  } else {
    const bare = /(?:^|[\s(])((?:[\p{L}\p{N}-]+\.)+([\p{L}]{2,}))(?=$|[\s/),.:;!?])/u.exec(t);
    if (bare && COMMON_TLDS.has((bare[2] as string).toLowerCase())) candidate = bare[1] as string;
  }
  if (!candidate) return null;
  try {
    return new URL(`http://${candidate.replace(/[.:]+$/, "")}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function sameSite(claimed: string, real: string): boolean {
  const strip = (h: string) => h.replace(/^www\./, "");
  const a = strip(claimed);
  const b = strip(real);
  return a === b || b.endsWith(`.${a}`);
}

/** Note links whose text names another host, and look-alike hosts; mark them in the frame too. */
function flagLinks(body: HTMLElement): SuspiciousLink[] {
  const out: SuspiciousLink[] = [];
  for (const a of Array.from(body.querySelectorAll("a[href]"))) {
    const host = linkHost(a.getAttribute("href") ?? "");
    if (!host) continue;
    const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    const claimed = claimedHost(text);
    let reason: SuspiciousLink["reason"] | null = null;
    if (claimed && !sameSite(claimed, host)) reason = "mismatch";
    else if (lookalikeHost(host) !== null) reason = "lookalike";
    if (!reason) continue;
    out.push({ text, host, reason });
    a.setAttribute("title", `Goes to ${host}`);
    const flag = a.ownerDocument.createElement("span");
    flag.setAttribute(FLAG_ATTR, "");
    flag.setAttribute("style", FLAG_STYLE);
    flag.textContent = `goes to ${host}`;
    a.after(flag);
  }
  return out;
}

// ---- Entry point ---------------------------------------------------------------

/** Sanitise a message's HTML for the sandboxed frame. Pure: the same input gives the same output. */
export function sanitizeMessageHtml(html: string, options: SanitizeOptions = {}): SanitizedHtml {
  const p = getPurifier();
  const s: RunState = { options, blocked: 0, ownColours: false };
  run = s;
  let root: Node;
  try {
    root = p.sanitize(html, CONFIG);
  } finally {
    run = null;
  }
  const htmlEl = root as HTMLElement;
  const doc = htmlEl.ownerDocument;
  let body = htmlEl.querySelector("body");
  if (!body) {
    body = doc.createElement("body");
    htmlEl.append(body);
  }
  const suspiciousLinks = flagLinks(body);
  const hasQuote = markQuote(body);
  const head = htmlEl.querySelector("head");
  // Serialising a detached document: this is a read, not an insertion into the app's DOM.
  const headHtml = head ? Array.from(head.querySelectorAll("style"), (s) => s.outerHTML).join("\n") : "";
  return {
    headHtml,
    bodyHtml: body.outerHTML,
    body,
    blockedRemote: s.blocked,
    hasQuote,
    suspiciousLinks,
    ownColours: s.ownColours,
  };
}

export { QUOTE_ATTR, FLAG_ATTR };
