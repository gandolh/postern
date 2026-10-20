// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { listedAttachments } from "./AttachmentList";
import { findCids, rasterDataUrl } from "./inline";
import { attachmentKind, doubleExtension, formatSize, isPdf, sniffRaster, typeLabel } from "./kind";
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
