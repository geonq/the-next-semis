import { NextResponse } from "next/server";
import { inflateSync } from "node:zlib";
import { getBrandColor, setBrandColor } from "@/lib/kv";

export const runtime = "nodejs";

// Curated brand-color verdicts for companies the automated pipeline gets wrong.
// Keys are lowercase substrings of the company name — first match wins.
//   string  -> authoritative brand color (SPA/no-signal sites we can't extract)
//   null    -> monochrome brand (white/black logo); use the theme accent, never guess
// `hit: false` means "not curated, run the extraction pipeline".
const BRAND_OVERRIDES: Record<string, string | null> = {
  hyperliquid: "#96fbd4", // turquoise; SPA with no extractable signal
  palantir: null // white/black wordmark — favicon pixel guessing wrongly returns red
};

function lookupOverride(company: string): { hit: boolean; color: string | null } {
  const lower = company.toLowerCase();
  for (const [key, color] of Object.entries(BRAND_OVERRIDES)) {
    if (lower.includes(key)) return { hit: true, color };
  }
  return { hit: false, color: null };
}

const browserUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const genericColors = new Set(["#fff", "#ffffff", "#000", "#000000"]);
const genericCssColors = new Set(["#18bc9c", "#2f96b4", "#51a351", "#bd362f", "#f89406", "#ff4136"]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const companySuffixPattern = /\b(Holding|Holdings|N\.V\.|Inc\.|Corp\.|Corporation|Ltd\.?|PLC|S\.A\.|AG|I)\b/gi;
// Never let the browser serve a stale color. The server is already fast — Redis
// caches the verdict in production and curated/override paths return instantly —
// so there's no need for an HTTP cache that can pin a wrong value for a day.
const cacheHeaders = {
  "Cache-Control": "no-store"
};

type DomainSuggestion = {
  domain?: string;
  name?: string;
};

function cleanHex(value: string | undefined): string | null {
  if (!value) return null;
  let color = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    color = "#" + [...color.slice(1)].map((char) => char + char).join("");
  }
  if (!/^#[0-9a-f]{3,8}$/i.test(color)) return null;
  color = color.slice(0, 7);
  if (genericColors.has(color.toLowerCase())) return null;
  return color;
}

function themeColor(html: string): string | null {
  const match =
    html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
  return cleanHex(match?.[1]);
}

function hexFromRgb(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function rgbFromHex(hex: string): [number, number, number] {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

function colorSignal(hex: string): number {
  if (genericCssColors.has(hex.toLowerCase())) return 0;
  const [r, g, b] = rgbFromHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = (r + g + b) / 3;
  if (brightness < 45 || brightness > 225 || saturation < 0.25) return 0;
  return saturation * (1 - Math.abs(brightness - 128) / 170);
}

function extractTextAccent(text: string): string | null {
  const scores = new Map<string, number>();
  for (const match of text.match(/#[0-9a-f]{3,8}\b/gi) ?? []) {
    const color = cleanHex(match);
    if (!color) continue;
    const signal = colorSignal(color);
    if (!signal) continue;
    scores.set(color, (scores.get(color) ?? 0) + signal);
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const [color, score] of scores) {
    if (score > bestScore) {
      best = color;
      bestScore = score;
    }
  }
  return best;
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function extractPngAccent(buffer: Buffer): string | null {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) return null;

    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rows = new Uint8Array(height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? rows[rowStart + x - channels] : 0;
      const above = y > 0 ? rows[previousRowStart + x] : 0;
      const upperLeft = y > 0 && x >= channels ? rows[previousRowStart + x - channels] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      if (filter === 2) value = raw + above;
      if (filter === 3) value = raw + Math.floor((left + above) / 2);
      if (filter === 4) value = raw + paethPredictor(left, above, upperLeft);
      rows[rowStart + x] = value & 0xff;
    }
    sourceOffset += stride;
  }

  const buckets = new Map<string, { count: number; r: number; g: number; b: number; score: number }>();
  const sampleStep = Math.max(1, Math.floor(Math.sqrt((width * height) / 4096)));

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const pixel = y * stride + x * channels;
      const alpha = channels === 4 ? rows[pixel + 3] : 255;
      if (alpha < 180) continue;

      const r = rows[pixel];
      const g = rows[pixel + 1];
      const b = rows[pixel + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = (r + g + b) / 3;
      if (brightness < 60 || brightness > 225 || saturation < 0.3) continue;

      const quantized = [r, g, b].map((value) => Math.round(value / 24) * 24);
      const key = quantized.join(",");
      const current = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0, score: 0 };
      current.count += 1;
      current.r += r;
      current.g += g;
      current.b += b;
      current.score += saturation * Math.min(1, Math.abs(brightness - 128) / 128 + 0.4);
      buckets.set(key, current);
    }
  }

  let best: { count: number; r: number; g: number; b: number; score: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count * bucket.score > best.count * best.score) best = bucket;
  }
  if (!best || best.count < 3) return null;
  return hexFromRgb(Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count));
}

async function resolveDomain(company: string, ticker?: string): Promise<string | null> {
  const normalizedTicker = normalizeToken(ticker ?? "");
  const companyTokens = company
    .replace(companySuffixPattern, "")
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 3);
  const queries = Array.from(
    new Set([
      company,
      company.replace(companySuffixPattern, "").trim(),
      company.split(/\s+/)[0],
      ticker
    ].filter((query): query is string => Boolean(query)))
  );

  let best: { domain: string; name: string; score: number } | null = null;
  for (const query of queries) {
    const response = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(8000), headers: { "User-Agent": browserUa } }
    );
    if (!response.ok) continue;
    const suggestions = (await response.json()) as DomainSuggestion[];
    for (const suggestion of suggestions.slice(0, 5)) {
      if (!suggestion.domain) continue;
      const score = scoreDomainSuggestion(suggestion, normalizedTicker, companyTokens);
      if (score > 0 && (!best || score > best.score)) best = { domain: suggestion.domain, name: suggestion.name ?? "", score };
    }
  }

  return best?.domain ?? null;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreDomainSuggestion(suggestion: DomainSuggestion, ticker: string, companyTokens: string[]): number {
  const domainRoot = normalizeToken(suggestion.domain?.split(".")[0] ?? "");
  const domain = normalizeToken(suggestion.domain ?? "");
  const name = normalizeToken(suggestion.name ?? "");
  let score = 0;

  if (ticker && domainRoot === ticker) score += 8;
  if (ticker && name === ticker) score += 4;
  if (ticker && name.includes(ticker)) score += 4;

  for (const token of companyTokens) {
    if (domainRoot === token) score += 20;
    else if (domain.includes(token)) score += 12;
    if (name.includes(token)) score += 14;
  }

  if (companyTokens.length > 0 && !companyTokens.some((token) => domain.includes(token) || name.includes(token))) {
    score -= 3;
  }
  return score;
}

async function fetchHomepage(domain: string): Promise<{ html: string; baseUrl: string } | null> {
  for (const url of [`https://www.${domain}`, `https://${domain}`]) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": browserUa }
      });
      if (!response.ok) continue;
      return { html: await response.text(), baseUrl: response.url || url };
    } catch {
      // Try the next host form.
    }
  }
  return null;
}

function stylesheetUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const links = html.matchAll(/<link\b[^>]*>/gi);
  for (const link of links) {
    const tag = link[0];
    if (!/rel=["'][^"']*stylesheet[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      urls.push(new URL(href, baseUrl).toString());
    } catch {
      // Ignore malformed stylesheet references.
    }
  }
  return urls.slice(0, 8);
}

async function fetchCssAccent(html: string, baseUrl: string): Promise<string | null> {
  let stylesheetText = "";
  for (const stylesheetUrl of stylesheetUrls(html, baseUrl)) {
    try {
      const stylesheet = await fetch(stylesheetUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": browserUa, Accept: "text/css" }
      });
      if (!stylesheet.ok) continue;
      stylesheetText += "\n" + (await stylesheet.text());
    } catch {
      // Try the next stylesheet.
    }
  }
  return extractTextAccent(stylesheetText);
}

function isExplicitMonochromeBrandPage(html: string): boolean {
  const lower = html.toLowerCase();
  return lower.includes("logo on black") || lower.includes("logo on white");
}

async function fetchLogoAccent(domain: string): Promise<string | null> {
  const logoUrls = [
    `https://logos.hunter.io/${domain}?format=png&size=128`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
  ];

  for (const url of logoUrls) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": browserUa, Accept: "image/png" }
      });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("image/png")) continue;
      const color = extractPngAccent(Buffer.from(await response.arrayBuffer()));
      if (color) return color;
    } catch {
      // Try the next logo source.
    }
  }
  return null;
}

function colorResponse(color: string | null) {
  return NextResponse.json({ color }, { headers: cacheHeaders });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company")?.trim();
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  if (!company) return colorResponse(null);

  try {
    const override = lookupOverride(company);
    if (override.hit) return colorResponse(override.color);

    const cacheKey = ticker ? `${ticker}:${company}` : company;
    const cached = await getBrandColor(cacheKey);
    if (cached !== undefined) return colorResponse(cached);

    const color = await resolveColor(company, ticker);
    await setBrandColor(cacheKey, color);
    return colorResponse(color);
  } catch {
    return colorResponse(null);
  }
}

async function resolveColor(company: string, ticker?: string): Promise<string | null> {
  const domain = await resolveDomain(company, ticker);
  if (!domain) return null;

  // Read the company's own page first: declared colors (inline styles, theme-color,
  // stylesheet accents) beat guessing pixels off a favicon. A monochrome brand page
  // (white/black wordmark) is a hard stop — never fall through to pixel-guessing,
  // which is what wrongly returned red for Palantir.
  const page = await fetchHomepage(domain);
  if (page) {
    if (isExplicitMonochromeBrandPage(page.html)) return null;
    const declared = extractTextAccent(page.html) ?? themeColor(page.html) ?? (await fetchCssAccent(page.html, page.baseUrl));
    if (declared) return declared;
  }

  // Last resort for sites that declare no usable color in markup or CSS.
  return fetchLogoAccent(domain);
}
