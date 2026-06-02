import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  cleanHex,
  colorClose,
  colorSignal,
  extractBrandApiColor,
  extractBrandVarColor,
  extractPngAccent,
  extractSvgColors,
  extractTextAccent,
  isMonoHex,
  isStrongStatisticalSignal,
  metaRefreshTarget,
  parseRawColor,
  sameOriginScripts,
  stylesheetUrls,
  themeColor
} from "@/lib/brand-color";

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
}

function png(width: number, height: number, r: number, g: number, b: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) rows.push(r, g, b);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

describe("brand-color pure helpers", () => {
  it("normalizes and rejects generic hex colors", () => {
    expect(cleanHex("#abc")).toBe("#aabbcc");
    expect(cleanHex("#ffffff")).toBeNull();
    expect(cleanHex("not-a-color")).toBeNull();
  });

  it("extracts declared theme colors and raw rgb/hex values", () => {
    expect(themeColor('<meta name="theme-color" content="#76B900">')).toBe("#76B900");
    expect(parseRawColor("rgb(118, 185, 0)")).toBe("#76b900");
    expect(parseRawColor("#aabbcc88")).toBe("#aabbcc");
    expect(parseRawColor("rgb(300, 0, 0)")).toBeNull();
  });

  it("scores vivid colors and treats greyscale as monochrome", () => {
    expect(colorSignal("#76b900")).toBeGreaterThan(0);
    expect(colorSignal("#ffffff")).toBe(0);
    expect(isMonoHex("#111111")).toBe(true);
    expect(isMonoHex("#76b900")).toBe(false);
    expect(colorClose("#76b900", "#78bb00")).toBe(true);
  });

  it("extracts statistically strong text and brand variable signals", () => {
    const text = "#ce1126 ".repeat(8) + "#00a9e0 ".repeat(2);
    const candidate = extractTextAccent(text);

    expect(candidate?.color).toBe("#ce1126");
    expect(candidate && isStrongStatisticalSignal(candidate)).toBe(true);
    expect(extractBrandVarColor(":root{--brand-primary:#ce1126;--primary:#4e8af7;}")).toBe("#ce1126");
    expect(extractBrandVarColor(":root{--primary:#4e8af7;}")).toBeNull();
  });

  it("extracts usable structured Brand API colors", () => {
    expect(
      extractBrandApiColor({
        colors: [{ hex: "#ffffff" }, { hex: "#ce1126" }, { hex: "#111111" }]
      })
    ).toBe("#ce1126");
    expect(extractBrandApiColor({ colors: [{ hex: "#ffffff" }, { hex: "#111111" }] })).toBeNull();
    expect(extractBrandApiColor({ colors: "nope" })).toBeNull();
  });

  it("extracts SVG colors and PNG accents", () => {
    expect(extractSvgColors('<svg><path fill="#000"/><path stroke="rgb(206,17,38)"/></svg>')).toEqual([
      "#000000",
      "#ce1126"
    ]);
    expect(extractPngAccent(png(4, 4, 206, 17, 38))).toBe("#ce1126");
  });

  it("finds meta refresh, stylesheet URLs, and same-origin scripts", () => {
    expect(metaRefreshTarget('<meta http-equiv="refresh" content="0; url=/next">', "https://example.com/")).toBe(
      "https://example.com/next"
    );
    expect(stylesheetUrls('<link rel="stylesheet" href="/app.css">', "https://example.com/a")).toEqual([
      "https://example.com/app.css"
    ]);
    expect(
      sameOriginScripts(
        '<script src="/app.js"></script><script src="https://cdn.example.com/track.js"></script>',
        "https://example.com"
      )
    ).toEqual(["https://example.com/app.js"]);
  });
});
