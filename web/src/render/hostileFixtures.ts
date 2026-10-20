// The hostile seed set (dev/seed/hostile/*.eml) as raw text, for the
// sanitiser's tests and brief 17's. Vite inlines the files (?raw), so this
// module must only be imported from tests: never from app code.

const files = import.meta.glob("../../../dev/seed/hostile/*.eml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export interface FixturePart {
  type: string;
  filename: string | null;
  disposition: string | null;
  contentId: string | null;
  body: string;
}

export interface HostileFixture {
  slug: string;
  raw: string;
  headers: Record<string, string>;
  /** Leaf parts in order (multiparts flattened). */
  parts: FixturePart[];
  /** The text/html parts joined, as the conversation view would sanitise them. */
  html: string | null;
  text: string | null;
}

function splitHead(raw: string): [Record<string, string>, string] {
  const normal = raw.replace(/\r\n/g, "\n");
  const at = normal.indexOf("\n\n");
  const head = at === -1 ? normal : normal.slice(0, at);
  const body = at === -1 ? "" : normal.slice(at + 2);
  const headers: Record<string, string> = {};
  let last = "";
  for (const line of head.split("\n")) {
    if (/^[ \t]/.test(line) && last) {
      headers[last] += ` ${line.trim()}`;
      continue;
    }
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    last = (m[1] as string).toLowerCase();
    headers[last] = m[2] as string;
  }
  return [headers, body];
}

function param(value: string | undefined, name: string): string | null {
  if (!value) return null;
  const m = new RegExp(`${name}="?([^";]+)"?`, "i").exec(value);
  return m ? (m[1] as string) : null;
}

function leaves(raw: string): FixturePart[] {
  const [headers, body] = splitHead(raw);
  const type = (headers["content-type"] ?? "text/plain").split(";")[0]?.trim().toLowerCase() ?? "text/plain";
  if (type.startsWith("multipart/")) {
    const boundary = param(headers["content-type"], "boundary");
    if (!boundary) return [];
    const chunks = body.split(`--${boundary}`);
    return chunks.slice(1).filter((c) => !c.startsWith("--")).flatMap((c) => leaves(c.replace(/^\n/, "")));
  }
  return [
    {
      type,
      filename: param(headers["content-disposition"], "filename") ?? param(headers["content-type"], "name"),
      disposition: headers["content-disposition"]?.split(";")[0]?.trim().toLowerCase() ?? null,
      contentId: headers["content-id"]?.replace(/^<|>$/g, "") ?? null,
      body,
    },
  ];
}

export const HOSTILE_FIXTURES: readonly HostileFixture[] = Object.entries(files)
  .map(([path, raw]) => {
    const [headers] = splitHead(raw);
    const parts = leaves(raw);
    const body = parts.filter((p) => p.disposition !== "attachment");
    const html = body.filter((p) => p.type === "text/html").map((p) => p.body);
    const text = body.filter((p) => p.type === "text/plain").map((p) => p.body);
    return {
      slug: (headers["x-postern-fixture"] ?? path).replace(/^hostile\//, ""),
      raw,
      headers,
      parts,
      html: html.length ? html.join("\n") : null,
      text: text.length ? text.join("\n") : null,
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));
