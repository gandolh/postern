// The "goes to <host>" pill Postern puts after a suspicious link inside the
// message frame. The message cannot use Postern's names (the sanitiser drops
// data-postern-* attributes and postern-* classes and ids from it), and the
// pill's look is an inline style where every declaration is !important: in
// the cascade, an element's own important declarations beat every
// stylesheet's, layered or not. `all: initial` first undoes whatever the
// message's rules set; direction and unicode-bidi, which `all` leaves alone,
// are set too. Pseudo-elements cannot be styled inline: srcdoc.ts kills them
// from the frame's first cascade layer. The banner outside the frame
// (MessageBody's LinkWarnings) stays the warning that counts.

/** Marks Postern's pill. A message's own data-postern-* attributes never survive the sanitiser. */
export const FLAG_ATTR = "data-postern-flag";

const DECLARATIONS = [
  "all:initial",
  "display:inline-block",
  "visibility:visible",
  "opacity:1",
  "position:static",
  "margin:0 0 0 .4em",
  "padding:0 .4em",
  "border-radius:4px",
  "font:600 12px/1.5 system-ui,sans-serif",
  "color:#5a3b00",
  "-webkit-text-fill-color:#5a3b00",
  "background:#fbeed3",
  "white-space:nowrap",
  "direction:ltr",
  "unicode-bidi:isolate",
  "writing-mode:horizontal-tb",
];

/** The pill's inline style. Its own background makes it readable in either colour scheme. */
export const FLAG_STYLE = DECLARATIONS.map((d) => `${d}!important`).join(";");
