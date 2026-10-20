// The tab title and favicon badge. Only the Inbox's unread count goes in: no
// token, no message text.

export const APP_TITLE = "Postern";

export function tabTitle(unread: number): string {
  return unread > 0 ? `Inbox (${unread}) — ${APP_TITLE}` : APP_TITLE;
}

/** The favicon's shape (a wall with a gate) with a count dot when there is unread mail. */
export function faviconSvg(unread: number): string {
  const label = unread > 9 ? "9+" : String(unread);
  const dot =
    unread > 0
      ? `<circle cx="23" cy="9" r="9" fill="#d93025"/><text x="23" y="${label.length > 1 ? 13.5 : 14}" font-family="sans-serif" font-size="${label.length > 1 ? 11 : 13}" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>`
      : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect fill="#1c6a57" width="32" height="32" rx="8"/>` +
    `<path fill="#f2f4f1" d="M15 32V20a4 4 0 0 1 8 0v12z"/>${dot}</svg>`
  );
}

export function faviconHref(unread: number): string {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(unread))}`;
}

/** Owns the document's title and icon while mounted: set(n) updates, restore() puts the originals back. */
export function createTabIndicators(doc: Document = document): { set(unread: number): void; restore(): void } {
  const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const originalTitle = doc.title;
  const originalHref = link?.getAttribute("href") ?? null;
  return {
    set(unread) {
      doc.title = tabTitle(unread);
      if (link && originalHref !== null) link.setAttribute("href", unread > 0 ? faviconHref(unread) : originalHref);
    },
    restore() {
      doc.title = originalTitle;
      if (link && originalHref !== null) link.setAttribute("href", originalHref);
    },
  };
}
