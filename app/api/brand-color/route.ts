import { NextResponse } from "next/server";
import { inflateSync } from "node:zlib";
import { getBrandColor, setBrandColor } from "@/lib/kv";

export const runtime = "nodejs";

// Brand color is detected fully automatically — no hardcoded color values, no override
// table. Signals are ranked by SOURCE AUTHORITY (a color a company *declares* in its
// manifest / theme-color / a CSS var named for the brand outranks a color merely
// *present* on the page), not by vividness alone. Below a confidence floor we return
// `null` and the UI falls back to the theme accent — the correct answer for monochrome
// brands. See `resolveColor` for the pipeline.
const browserUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const genericColors = new Set(["#fff", "#ffffff", "#000", "#000000"]);
const genericCssColors = new Set(["#18bc9c", "#2f96b4", "#51a351", "#bd362f", "#f89406", "#ff4136"]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const companySuffixPattern = /\b(Holding|Holdings|N\.V\.|Inc\.|Corp\.|Corporation|Ltd\.?|PLC|S\.A\.|AG)\b/gi;
// Total CSS we'll pull across all stylesheets per request. A byte budget (not a count
// cap) so a brand color living in the Nth stylesheet — RTX's red lives in the 6th —
// is never truncated out, while a pathological page can't make us fetch forever.
const cssByteBudget = 1_500_000;
// Never let the browser serve a stale color. The server is already fast — Redis
// caches the verdict in production — so there's no need for an HTTP cache that can
// pin a wrong value for a day.
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

function saturationOf(hex: string): number {
  const [r, g, b] = rgbFromHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

// Black / white / grey. The structural definition of "monochrome" — a brand whose
// strongest signal is one of these has no brand color (Palantir's wordmark).
function isMonoHex(hex: string): boolean {
  return saturationOf(hex) < 0.15;
}

// Parse a raw CSS/SVG color token to #rrggbb, KEEPING black/white (callers that need
// to detect monochrome can't have those silently dropped). Hex (#rgb/#rrggbb[aa]) and
// rgb()/rgba() only — hsl()/named colors fall through to null.
function parseRawColor(value: string): string | null {
  const hex = value.match(/#[0-9a-f]{3,8}\b/i)?.[0];
  if (hex) {
    let color = hex;
    if (/^#[0-9a-f]{3}$/i.test(color)) color = "#" + [...color.slice(1)].map((c) => c + c).join("");
    if (!/^#[0-9a-f]{6,8}$/i.test(color)) return null;
    return color.slice(0, 7).toLowerCase();
  }
  const rgb = value.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if ([r, g, b].some((n) => n > 255)) return null;
    return hexFromRgb(r, g, b);
  }
  return null;
}

// Like parseRawColor, but drops generic white/black (used for *declared brand* values
// where pure black/white is never the intended accent).
function parseBrandColor(value: string): string | null {
  const raw = parseRawColor(value);
  return raw ? cleanHex(raw) : null;
}

function mostSaturated(colors: string[]): string | null {
  let best: string | null = null;
  let bestSat = -1;
  for (const color of colors) {
    const sat = saturationOf(color);
    if (sat > bestSat) {
      bestSat = sat;
      best = color;
    }
  }
  return best;
}

function colorClose(a: string, b: string): boolean {
  const [r1, g1, b1] = rgbFromHex(a);
  const [r2, g2, b2] = rgbFromHex(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) < 64;
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
  // No count cap (a count cap of 8 once truncated RTX's brand sheet and flipped it to
  // cyan). The total-bytes budget in `fetchAllCss` is the real limit; 40 just stops a
  // pathological page with hundreds of <link>s from spawning hundreds of fetches.
  return urls.slice(0, 40);
}

// Source 5b — frequency-weighted dominant color across the site's OWN JS bundles. Last
// resort for client-rendered SPAs whose brand color is baked into JS rather than the
// HTML/CSS/manifest (Hyperliquid's turquoise lives only here — its manifest is black).
// Same-origin only (never trust third-party/analytics JS); byte-budgeted.
const jsByteBudget = 4_000_000;
function sameOriginScripts(html: string, baseUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  const urls: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js[^"'?]*)/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.origin === origin) urls.push(url.toString());
    } catch {
      // Ignore malformed script references.
    }
  }
  return Array.from(new Set(urls)).slice(0, 4);
}

async function fetchJsBundleColor(html: string, baseUrl: string): Promise<string | null> {
  let text = "";
  for (const scriptUrl of sameOriginScripts(html, baseUrl)) {
    if (text.length >= jsByteBudget) break;
    try {
      const response = await fetch(scriptUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": browserUa }
      });
      if (!response.ok) continue;
      text += "\n" + (await response.text());
    } catch {
      // Try the next bundle.
    }
  }
  return extractTextAccent(text.slice(0, jsByteBudget));
}

// Pull every same-origin stylesheet up to the byte budget, concatenated. Source for
// both the named-brand-var signal and the frequency-weighted dominant signal.
async function fetchAllCss(html: string, baseUrl: string): Promise<string> {
  let text = "";
  for (const stylesheetUrl of stylesheetUrls(html, baseUrl)) {
    if (text.length >= cssByteBudget) break;
    try {
      const stylesheet = await fetch(stylesheetUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": browserUa, Accept: "text/css" }
      });
      if (!stylesheet.ok) continue;
      text += "\n" + (await stylesheet.text());
    } catch {
      // Try the next stylesheet.
    }
  }
  return text.slice(0, cssByteBudget);
}

// Source 1 — web-app manifest `theme_color` (then `background_color`). PWAs/SPAs declare
// their brand color here even when the server HTML is an empty shell; this is how a
// client-rendered site like Hyperliquid is resolved without any markup signal.
async function fetchManifestColor(html: string, baseUrl: string): Promise<string | null> {
  const urls: string[] = [];
  const linkTag = html.match(/<link\b[^>]*rel=["'][^"']*manifest[^"']*["'][^>]*>/i)?.[0];
  const linkHref = linkTag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  for (const candidate of [linkHref, "/manifest.json", "/site.webmanifest"]) {
    if (!candidate) continue;
    try {
      urls.push(new URL(candidate, baseUrl).toString());
    } catch {
      // Ignore malformed manifest references.
    }
  }

  for (const url of Array.from(new Set(urls))) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": browserUa, Accept: "application/manifest+json, application/json" }
      });
      if (!response.ok) continue;
      const manifest = (await response.json()) as { theme_color?: string; background_color?: string };
      for (const raw of [manifest.theme_color, manifest.background_color]) {
        const color = raw ? parseBrandColor(raw) : null;
        if (color && !isMonoHex(color)) return color;
      }
    } catch {
      // Not JSON, missing, or timed out — try the next manifest URL.
    }
  }
  return null;
}

// Source 3 — a CSS custom property literally named for the brand. A var named `--brand`
// is a declared signal worth far more than an incidental accent. Most saturated wins.
const brandVarPattern = /--(?:brand|color-brand|color-primary|primary|accent)(?:-[a-z0-9]+)?\s*:\s*([^;{}]+)[;}]/gi;
function extractBrandVarColor(css: string): string | null {
  const candidates: string[] = [];
  for (const match of css.matchAll(brandVarPattern)) {
    const color = parseBrandColor(match[1]);
    if (color && !isMonoHex(color) && colorSignal(color) > 0) candidates.push(color);
  }
  return mostSaturated(candidates);
}

// Source 4 — the brand's SVG logo. SVG logos carry the EXACT brand hex, and a logo whose
// only fills are black/white/grey is the structural definition of a monochrome brand
// (this replaces the old "logo on black" string hack and is how Palantir resolves null).
function extractSvgColors(svg: string): string[] {
  const out: string[] = [];
  for (const match of svg.matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]+\))/gi)) {
    const color = parseRawColor(match[1]); // keep black/white so mono logos are detectable
    if (color) out.push(color);
  }
  return out;
}

async function fetchSvgLogoColor(html: string, baseUrl: string): Promise<{ color: string | null; mono: boolean } | null> {
  const hrefs: string[] = [];
  for (const link of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = link[0];
    if (!/rel=["'][^"']*icon[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+\.svg[^"'?]*)/i)?.[1];
    if (href) hrefs.push(href);
  }
  for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = img[0];
    const src = tag.match(/\bsrc=["']([^"']+\.svg[^"'?]*)/i)?.[1];
    if (src && (/logo/i.test(tag) || /logo/i.test(src))) hrefs.push(src);
  }

  const urls: string[] = [];
  for (const href of hrefs) {
    try {
      urls.push(new URL(href, baseUrl).toString());
    } catch {
      // Ignore malformed logo references.
    }
  }

  for (const url of Array.from(new Set(urls)).slice(0, 3)) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": browserUa, Accept: "image/svg+xml" }
      });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();
      if (!contentType.includes("svg") && !text.includes("<svg")) continue;
      const colors = extractSvgColors(text);
      if (colors.length === 0) continue; // inconclusive (e.g. currentColor) — try next
      const nonMono = colors.filter((color) => !isMonoHex(color));
      if (nonMono.length === 0) return { color: null, mono: true };
      return { color: mostSaturated(nonMono), mono: false };
    } catch {
      // Try the next logo source.
    }
  }
  return null;
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

type Signal = { color: string; confidence: number };

// Gather every signal that fires, rank by source authority (confidence), and take the
// strongest. Below the floor, a lone signal is discarded in favor of the neutral theme
// accent — a wrong vivid color is more jarring than no color. Monochrome brands resolve
// to null up front via their SVG logo. Zero hardcoded colors, no override table.
async function resolveColor(company: string, ticker?: string): Promise<string | null> {
  const domain = await resolveDomain(company, ticker);
  if (!domain) return null;
  const page = await fetchHomepage(domain);
  if (!page) return null;

  const signals: Signal[] = [];

  // Source 4 — SVG logo. Authoritative, and the only structural test for monochrome.
  const svg = await fetchSvgLogoColor(page.html, page.baseUrl);
  if (svg?.mono) return null; // monochrome wordmark → theme accent (Palantir)
  if (svg?.color) signals.push({ color: svg.color, confidence: 0.85 });

  // Source 1 — web-app manifest (solves client-rendered SPAs like Hyperliquid).
  const manifest = await fetchManifestColor(page.html, page.baseUrl);
  if (manifest) signals.push({ color: manifest, confidence: 0.95 });

  // Source 2 — theme-color meta tag.
  const theme = themeColor(page.html);
  if (theme) signals.push({ color: theme, confidence: 0.9 });

  // Sources 3 & 5 — named brand CSS vars and frequency-weighted dominant, from ALL
  // stylesheets (RTX's red lives in the 6th sheet and wins on 197× occurrences).
  const css = await fetchAllCss(page.html, page.baseUrl);
  const brandVar = extractBrandVarColor(css);
  if (brandVar) signals.push({ color: brandVar, confidence: 0.85 });
  const dominant = extractTextAccent(page.html + "\n" + css);
  if (dominant) signals.push({ color: dominant, confidence: 0.6 });

  // Source 5b — JS bundles. Gated to fire only when no stronger signal surfaced, so a
  // client-rendered SPA (Hyperliquid) still yields its brand color without ever
  // overriding a real CSS/manifest/SVG signal on a normal site.
  if (!signals.some((signal) => signal.confidence >= 0.6)) {
    const jsColor = await fetchJsBundleColor(page.html, page.baseUrl);
    if (jsColor) signals.push({ color: jsColor, confidence: 0.55 });
  }

  // Source 6 — favicon pixels. Absolute last resort, and (via the floor below) never
  // decisive on its own — this is what once returned red for Palantir's favicon.
  if (!signals.some((signal) => signal.confidence >= 0.55)) {
    const favicon = await fetchLogoAccent(domain);
    if (favicon) signals.push({ color: favicon, confidence: 0.4 });
  }

  if (signals.length === 0) return null;
  signals.sort((a, b) => b.confidence - a.confidence);
  const best = signals[0];
  if (best.confidence < 0.55 && !signals.some((s) => s !== best && colorClose(s.color, best.color))) {
    return null; // weak and uncorroborated → neutral accent
  }
  return best.color;
}
