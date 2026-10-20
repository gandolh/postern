// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { JmapClient } from "@postern/jmap";
import { attachmentWarning, canPreview, listedAttachments } from "./AttachmentList";
import { fileName, imageDataUrl, MAX_PREVIEW_BYTES } from "./files";
import { cidPartsToInline, findCids, MAX_INLINE_TOTAL_BYTES, rasterDataUrl } from "./inline";
import { attachmentKind, doubleExtension, formatSize, hasBidiControls, isPdf, sniffRaster, stripBidiControls, typeLabel } from "./kind";
import { viewerSrcdoc } from "./ImageViewer";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("attachment kinds", () => {
  it("previews raster images and PDFs; HTML, SVG and XML are active (download only)", () => {
    expect(attachmentKind("image/png", "a.png")).toBe("image");
    expect(attachmentKind("image/jpeg", "photo")).toBe("image");
    expect(attachmentKind("application/pdf", "contract.pdf")).toBe("pdf");
    expect(attachmentKind("application/octet-stream", "contract.pdf")).toBe("pdf");
    expect(attachmentKind("image/svg+xml", "chart.svg")).toBe("active");
    expect(attachmentKind("text/html", "invoice.pdf.html")).toBe("active");
    // The name wins when it is more dangerous than the type.
    expect(attachmentKind("application/pdf", "invoice.pdf.html")).toBe("active");
    expect(attachmentKind("image/png", "x.svg")).toBe("active");
    expect(attachmentKind("text/csv", "data.csv")).toBe("other");
  });

  it("flags a double extension ending in something that runs", () => {
    expect(doubleExtension("invoice.pdf.html")).toEqual({ shown: "pdf", real: "html" });
    expect(doubleExtension("photo.jpg.exe")).toEqual({ shown: "jpg", real: "exe" });
    expect(doubleExtension("archive.tar.gz")).toBeNull();
    expect(doubleExtension("report.v2.pdf")).toBeNull();
  });

  it("labels and sizes", () => {
    expect(typeLabel("application/pdf", "x.pdf")).toBe("PDF");
    expect(typeLabel("text/calendar", null)).toBe("CALENDAR");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(5_000_000)).toBe("4.8 MB");
  });

  it("trusts bytes, not declared types", () => {
    expect(sniffRaster(PNG)).toBe("image/png");
    expect(sniffRaster(new TextEncoder().encode("<svg xmlns=...>"))).toBeNull();
    expect(isPdf(new TextEncoder().encode("%PDF-1.4\n..."))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
    expect(rasterDataUrl(PNG)?.startsWith("data:image/png;base64,")).toBe(true);
    expect(rasterDataUrl(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});

describe("inline images", () => {
  it("finds every cid the HTML refers to", () => {
    expect([...findCids('<img src="cid:a@b"><div style="background:url(cid:c%40d)">')]).toEqual(["a@b", "c@d"]);
  });

  it("leaves inline parts off the chips", () => {
    const part = (cid: string | null, blobId: string) => ({ partId: "1", blobId, size: 1, name: "x.png", type: "image/png", charset: null, disposition: null, cid, location: null });
    expect(listedAttachments([part("a@b", "B1"), part(null, "B2"), part("svg@x", "B3")], new Set(["a@b"])).map((p) => p.blobId)).toEqual(["B2", "B3"]);
  });

  it("builds the viewer page only around a raster data: URL", () => {
    expect(viewerSrcdoc("data:image/png;base64,AAAA")).toContain('<img src="data:image/png;base64,AAAA"');
    expect(viewerSrcdoc("data:image/png;base64,AAAA")).toContain("default-src 'none'; img-src data:");
    expect(() => viewerSrcdoc('data:image/png;base64,AA"><script>')).toThrow();
    expect(() => viewerSrcdoc("data:image/svg+xml;base64,AAAA")).toThrow();
  });
});

describe("bidi characters in file names (security review 2026-10-20)", () => {
  const RLO = "Invoice_\u202Efdp.exe";

  it("reads the name in its real order", () => {
    expect(hasBidiControls(RLO)).toBe(true);
    expect(stripBidiControls(RLO)).toBe("Invoice_fdp.exe");
    expect(typeLabel("application/pdf", RLO)).toBe("EXE");
    expect(attachmentKind("application/pdf", RLO)).toBe("other");
    // Every control: embeddings, overrides, isolates, marks.
    expect(stripBidiControls("a\u202Ab\u202Bc\u202Cd\u202De\u2066f\u2067g\u2068h\u2069i\u200Ej\u200Fk\u061Cl")).toBe("abcdefghijkl");
  });

  it("warns, shows and saves the stripped name, and never previews it", () => {
    const part = { name: RLO, type: "application/pdf" };
    const warning = attachmentWarning(part);
    expect(warning).toContain("reverse");
    expect(warning).toContain("Invoice_fdp.exe");
    expect(fileName({ blobId: "B", name: RLO, type: "application/pdf" })).toBe("Invoice_fdp.exe");
    expect(canPreview({ size: 10 }, "pdf", warning)).toBe(false);
    // A double extension hidden behind an override is still caught.
    expect(doubleExtension("photo\u202Egpj.exe")).toBeNull();
    expect(doubleExtension("photo.jpg\u202E.exe")).toEqual({ shown: "jpg", real: "exe" });
  });
});

describe("size caps (security review 2026-10-20)", () => {
  it("previews images up to MAX_PREVIEW_BYTES only", () => {
    expect(canPreview({ size: MAX_PREVIEW_BYTES }, "image", null)).toBe(true);
    expect(canPreview({ size: MAX_PREVIEW_BYTES + 1 }, "image", null)).toBe(false);
  });

  it("refuses to build a preview from more bytes than the cap", async () => {
    const big = new Uint8Array(MAX_PREVIEW_BYTES + 1);
    big.set(PNG);
    const client = { blob: { download: async () => new Response(big) } } as unknown as JmapClient;
    await expect(imageDataUrl(client, { blobId: "B", name: "huge.png", type: "image/png" })).rejects.toThrow(/too large to preview/);
  });

  it("fetches inline images on open within a per-message budget, the rest on request", async () => {
    const part = (cid: string, size: number) => ({ partId: cid, blobId: `blob-${cid}`, size, name: `${cid}.png`, type: "image/png", charset: null, disposition: "inline", cid, location: null });
    const MB = 1_000_000;
    const email = { attachments: [part("a", 6 * MB), part("b", 6 * MB), part("c", 6 * MB), part("d", 9 * MB), part("e", 30 * MB)] };
    const fetched: string[] = [];
    const fetchBlob = async (params: { blobId: string }) => {
      fetched.push(params.blobId);
      return new Blob([PNG]);
    };
    const signal = new AbortController().signal;
    const onOpen = await cidPartsToInline(email, ["a", "b", "c", "d", "e"], fetchBlob, signal);
    expect(MAX_INLINE_TOTAL_BYTES).toBe(16 * MB);
    expect(fetched).toEqual(["blob-a", "blob-b"]);
    expect([...onOpen.cids]).toEqual(["a", "b"]);
    expect([...onOpen.deferred]).toEqual(["c", "d"]);
    expect(onOpen.deferredBytes).toBe(15 * MB);
    fetched.length = 0;
    const onRequest = await cidPartsToInline(email, onOpen.deferred, fetchBlob, signal, { total: Number.POSITIVE_INFINITY, perImage: 20 * MB });
    expect(fetched).toEqual(["blob-c", "blob-d"]);
    expect([...onRequest.cids]).toEqual(["c", "d"]);
    // Past 20 MB an inline image is never inlined, even on request: it stays an attachment.
    expect(onRequest.deferred.size).toBe(0);
  });
});
