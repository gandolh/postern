// Session URL rebasing and RFC 6570 level-1 template expansion.
//
// Stalwart builds session URLs from its own hostname, https regardless:
// `https://mail.postern.test/jmap/download/{accountId}/...`. Postern reaches
// Stalwart through `/webmail-api` (or a test base), so each URL keeps its path,
// query and template variables and swaps its origin for the base. This is
// string work on purpose: WHATWG `URL` percent-encodes `{` and `}` in paths,
// which would break the templates, and the base may be relative.

const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i;

/** Strip a trailing slash: `/webmail-api/` → `/webmail-api`. */
export function normalizeBase(base: string): string {
  return base.replace(/\/+$/, "");
}

/**
 * Put a session URL onto `base`, keeping its path, query and template
 * variables: `https://mail.x/jmap/upload/{accountId}/` with base
 * `/webmail-api` → `/webmail-api/jmap/upload/{accountId}/`.
 */
export function rebaseUrl(url: string, base: string): string {
  const rest = url.replace(ORIGIN, "");
  const path = rest.startsWith("/") ? rest : `/${rest}`;
  return normalizeBase(base) + path;
}

/** Percent-encode everything except RFC 3986 unreserved characters (level-1 expansion). */
function encodeLevel1(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Expand a level-1 URI template: each `{name}` becomes its encoded value.
 * Throws if a variable is missing, so a typo cannot produce a wrong URL.
 */
export function expandTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^{}]+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`URL template variable {${name}} has no value`);
    return encodeLevel1(value);
  });
}

/** The variable names in a template, in order: `{accountId}` → `["accountId"]`. */
export function templateVariables(template: string): string[] {
  return [...template.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1] ?? "");
}
