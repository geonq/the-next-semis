import { NextResponse } from "next/server";
import {
  colorClose,
  extractBrandVarColor,
  extractPngAccent,
  extractSvgColors,
  extractTextAccent,
  isMonoHex,
  isStrongStatisticalSignal,
  metaRefreshTarget,
  mostSaturated,
  parseBrandColor,
  sameOriginScripts,
  stylesheetUrls,
  themeColor,
  type ColorCandidate
} from "@/lib/brand-color";
import { getBrandColor, setBrandColor } from "@/lib/kv";

export const runtime = "nodejs";

// Brand color is detected fully automatically — no hardcoded color values, no override
// table. Signals are ranked by SOURCE AUTHORITY (a color a company *declares* in its
// manifest / theme-color / a CSS var named for the brand outranks a color merely
// *present* on the page), not by vividness alone. Below a confidence floor we return
// `null` and the UI falls back to the theme accent — the correct answer for monochrome
// brands. See `resolveColor` for the pipeline.
const browserUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
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

// Vercel Hobby functions have a 10s hard limit. This global abort fires at 8.5s so we
// can return a clean null before the platform kills the invocation. On timeout we skip
// caching so the next request retries fresh.
const GLOBAL_TIMEOUT_MS = 8500;

// Combine a per-step timeout with the global abort so whichever fires first wins.
function withTimeout(ms: number, globalSignal?: AbortSignal): AbortSignal {
  return globalSignal
    ? AbortSignal.any([globalSignal, AbortSignal.timeout(ms)])
    : AbortSignal.timeout(ms);
}

type DomainSuggestion = {
  domain?: string;
  name?: string;
};

async function resolveDomain(company: string, ticker?: string, globalSignal?: AbortSignal): Promise<string | null> {
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

  // Run all Clearbit queries in parallel — sequential would burn most of the 10s budget.
  const results = await Promise.allSettled(
    queries.map((query) =>
      fetch(
        `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`,
        { signal: withTimeout(4000, globalSignal), headers: { "User-Agent": browserUa } }
      ).then((r) => (r.ok ? (r.json() as Promise<DomainSuggestion[]>) : Promise.resolve([] as DomainSuggestion[])))
    )
  );

  let best: { domain: string; name: string; score: number } | null = null;
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const suggestion of result.value.slice(0, 5)) {
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

async function fetchHomepage(domain: string, globalSignal?: AbortSignal): Promise<{ html: string; baseUrl: string } | null> {
  for (const start of [`https://www.${domain}`, `https://${domain}`]) {
    let url = start;
    // Follow up to 3 meta-refresh hops to land on the real site (loop-guarded).
    for (let hop = 0; hop < 3; hop += 1) {
      let page: { html: string; baseUrl: string };
      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: withTimeout(5000, globalSignal),
          headers: { "User-Agent": browserUa }
        });
        if (!response.ok) break; // try the next host form
        page = { html: await response.text(), baseUrl: response.url || url };
      } catch {
        break; // try the next host form
      }
      const next = metaRefreshTarget(page.html, page.baseUrl);
      if (next && next !== url) {
        url = next;
        continue;
      }
      return page;
    }
  }
  return null;
}

// Source 5b — frequency-weighted dominant color across the site's OWN JS bundles. Last
// resort for client-rendered SPAs whose brand color is baked into JS rather than the
// HTML/CSS/manifest (Hyperliquid's turquoise lives only here — its manifest is black).
// Same-origin only (never trust third-party/analytics JS); byte-budgeted.
const jsByteBudget = 4_000_000;
async function fetchJsBundleColor(html: string, baseUrl: string, globalSignal?: AbortSignal): Promise<ColorCandidate | null> {
  let text = "";
  for (const scriptUrl of sameOriginScripts(html, baseUrl)) {
    if (text.length >= jsByteBudget) break;
    try {
      const response = await fetch(scriptUrl, {
        redirect: "follow",
        signal: withTimeout(4000, globalSignal),
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
async function fetchAllCss(html: string, baseUrl: string, globalSignal?: AbortSignal): Promise<string> {
  let text = "";
  for (const stylesheetUrl of stylesheetUrls(html, baseUrl)) {
    if (text.length >= cssByteBudget) break;
    try {
      const stylesheet = await fetch(stylesheetUrl, {
        redirect: "follow",
        signal: withTimeout(3000, globalSignal),
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
async function fetchManifestColor(html: string, baseUrl: string, globalSignal?: AbortSignal): Promise<string | null> {
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
        signal: withTimeout(3000, globalSignal),
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

async function fetchSvgLogoColor(html: string, baseUrl: string, globalSignal?: AbortSignal): Promise<{ color: string | null; mono: boolean } | null> {
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
        signal: withTimeout(3000, globalSignal),
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

async function fetchLogoAccent(domain: string, globalSignal?: AbortSignal): Promise<string | null> {
  const logoUrls = [
    `https://logos.hunter.io/${domain}?format=png&size=128`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
  ];

  for (const url of logoUrls) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: withTimeout(4000, globalSignal),
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
  if (company.length > 200 || (ticker && !/^[A-Z0-9.-]{1,20}$/.test(ticker))) {
    return colorResponse(null);
  }

  try {
    const cacheKey = ticker ? `${ticker}:${company}` : company;
    const cached = await getBrandColor(cacheKey);
    if (cached !== undefined) return colorResponse(cached);

    // Global abort at 8.5s — Vercel Hobby kills the function at 10s. On timeout we
    // return null WITHOUT caching so the next request retries the detection fresh.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);
    try {
      const color = await resolveColor(company, ticker, controller.signal);
      await setBrandColor(cacheKey, color);
      return colorResponse(color);
    } catch {
      if (controller.signal.aborted) {
        // Timed out — don't cache, let next request retry.
        return colorResponse(null);
      }
      return colorResponse(null);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return colorResponse(null);
  }
}

type Signal = { color: string; confidence: number };

// Gather every signal that fires, rank by source authority (confidence), and take the
// strongest. Below the floor, a lone signal is discarded in favor of the neutral theme
// accent — a wrong vivid color is more jarring than no color. Monochrome brands resolve
// to null up front via their SVG logo. Zero hardcoded colors, no override table.
async function resolveColor(company: string, ticker?: string, globalSignal?: AbortSignal): Promise<string | null> {
  const domain = await resolveDomain(company, ticker, globalSignal);
  if (!domain) return null;

  const page = await fetchHomepage(domain, globalSignal);
  if (!page) {
    // Homepage blocked or unreachable (e.g. tesla.com 403s server requests).
    // Logo sources work independently — use as best-effort fallback.
    return await fetchLogoAccent(domain, globalSignal);
  }

  const signals: Signal[] = [];

  // Source 4 — SVG logo. Authoritative, and the only structural test for monochrome.
  const svg = await fetchSvgLogoColor(page.html, page.baseUrl, globalSignal);
  if (svg?.mono) return null; // monochrome wordmark → theme accent (Palantir)
  if (svg?.color) signals.push({ color: svg.color, confidence: 0.85 });

  // Source 1 — web-app manifest (solves client-rendered SPAs like Hyperliquid).
  const manifest = await fetchManifestColor(page.html, page.baseUrl, globalSignal);
  if (manifest) signals.push({ color: manifest, confidence: 0.95 });

  // Source 2 — theme-color meta tag.
  const theme = themeColor(page.html);
  if (theme) signals.push({ color: theme, confidence: 0.9 });

  // Sources 3 & 5 — named brand CSS vars and frequency-weighted dominant, from ALL
  // stylesheets (RTX's red lives in the 6th sheet and wins on 197× occurrences).
  const css = await fetchAllCss(page.html, page.baseUrl, globalSignal);
  const brandVar = extractBrandVarColor(css);
  if (brandVar) signals.push({ color: brandVar, confidence: 0.85 });
  const dominant = extractTextAccent(page.html + "\n" + css);
  if (dominant && isStrongStatisticalSignal(dominant)) {
    signals.push({ color: dominant.color, confidence: 0.6 });
  }

  // Source 5b — JS bundles. Gated to fire only when no stronger signal surfaced, so a
  // client-rendered SPA (Hyperliquid) still yields its brand color without ever
  // overriding a real CSS/manifest/SVG signal on a normal site.
  if (!signals.some((signal) => signal.confidence >= 0.6)) {
    const jsColor = await fetchJsBundleColor(page.html, page.baseUrl, globalSignal);
    if (jsColor) {
      signals.push({ color: jsColor.color, confidence: 0.55 });
    }
  }

  // Source 6 — favicon pixels. Absolute last resort, and (via the floor below) never
  // decisive on its own — this is what once returned red for Palantir's favicon.
  if (!signals.some((signal) => signal.confidence >= 0.55)) {
    const favicon = await fetchLogoAccent(domain, globalSignal);
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
