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
import { fetchBrandfetchColor } from "@/lib/brandfetch";
import { getBrandColor, setBrandColor } from "@/lib/kv";
import { isSafePublicUrl } from "@/lib/ssrf";

const browserUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const companySuffixPattern = /\b(Holding|Holdings|N\.V\.|Inc\.|Corp\.|Corporation|Ltd\.?|PLC|S\.A\.|AG)\b/gi;
const cssByteBudget = 1_500_000;
const GLOBAL_TIMEOUT_MS = 8500;
const MAX_PUBLIC_REDIRECTS = 4;

function withTimeout(ms: number, globalSignal?: AbortSignal): AbortSignal {
  return globalSignal
    ? AbortSignal.any([globalSignal, AbortSignal.timeout(ms)])
    : AbortSignal.timeout(ms);
}

async function fetchPublic(url: string, init: RequestInit): Promise<{ response: Response; url: string } | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_PUBLIC_REDIRECTS; hop += 1) {
    if (!(await isSafePublicUrl(current))) return null;
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      try {
        current = new URL(location, current).toString();
      } catch {
        return null;
      }
      continue;
    }
    return { response, url: current };
  }
  return null;
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

  if (ticker && domainRoot === ticker) score += 30;
  if (ticker && name === ticker) score += 20;
  if (ticker && name.includes(ticker)) score += 4;

  for (const token of companyTokens) {
    if (domainRoot === token) score += 20;
    else if (domain.includes(token)) score += 12;
    if (name.includes(token)) score += 14;
  }

  if (companyTokens.length > 0 && !companyTokens.some((token) => domain.includes(token) || name.includes(token))) {
    if (!(ticker && (domainRoot === ticker || name === ticker))) {
      score -= 3;
    }
  }
  return score;
}

async function fetchHomepage(domain: string, globalSignal?: AbortSignal): Promise<{ html: string; baseUrl: string } | null> {
  for (const start of [`https://www.${domain}`, `https://${domain}`]) {
    let url = start;
    for (let hop = 0; hop < 3; hop += 1) {
      let page: { html: string; baseUrl: string };
      try {
        const fetched = await fetchPublic(url, {
          signal: withTimeout(5000, globalSignal),
          headers: { "User-Agent": browserUa }
        });
        if (!fetched) break;
        const { response } = fetched;
        if (!response.ok) break;
        page = { html: await response.text(), baseUrl: fetched.url };
      } catch {
        break;
      }
      const next = metaRefreshTarget(page.html, page.baseUrl);
      if (next && next !== url && await isSafePublicUrl(next)) {
        url = next;
        continue;
      }
      return page;
    }
  }
  return null;
}

const jsByteBudget = 4_000_000;
async function fetchJsBundleColor(html: string, baseUrl: string, globalSignal?: AbortSignal): Promise<ColorCandidate | null> {
  let text = "";
  for (const scriptUrl of sameOriginScripts(html, baseUrl)) {
    if (text.length >= jsByteBudget) break;
    try {
      const fetched = await fetchPublic(scriptUrl, {
        signal: withTimeout(4000, globalSignal),
        headers: { "User-Agent": browserUa }
      });
      if (!fetched) continue;
      const { response } = fetched;
      if (!response.ok) continue;
      text += "\n" + (await response.text());
    } catch {
      // Try next
    }
  }
  return extractTextAccent(text.slice(0, jsByteBudget));
}

async function fetchAllCss(html: string, baseUrl: string, globalSignal?: AbortSignal): Promise<string> {
  let text = "";
  for (const stylesheetUrl of stylesheetUrls(html, baseUrl)) {
    if (text.length >= cssByteBudget) break;
    try {
      const fetched = await fetchPublic(stylesheetUrl, {
        signal: withTimeout(3000, globalSignal),
        headers: { "User-Agent": browserUa, Accept: "text/css", Referer: baseUrl }
      });
      if (!fetched) continue;
      const { response: stylesheet } = fetched;
      if (!stylesheet.ok) continue;
      text += "\n" + (await stylesheet.text());
    } catch {
      // Try next
    }
  }
  return text.slice(0, cssByteBudget);
}

async function fetchManifestColor(html: string, baseUrl: string, globalSignal?: AbortSignal): Promise<string | null> {
  const urls: string[] = [];
  const linkTag = html.match(/<link\b[^>]*rel=["'][^"']*manifest[^"']*["'][^>]*>/i)?.[0];
  const linkHref = linkTag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  for (const candidate of [linkHref, "/manifest.json", "/site.webmanifest"]) {
    if (!candidate) continue;
    try {
      urls.push(new URL(candidate, baseUrl).toString());
    } catch {
      // Ignore
    }
  }

  for (const url of Array.from(new Set(urls))) {
    try {
      const fetched = await fetchPublic(url, {
        signal: withTimeout(3000, globalSignal),
        headers: { "User-Agent": browserUa, Accept: "application/manifest+json, application/json" }
      });
      if (!fetched) continue;
      const { response } = fetched;
      if (!response.ok) continue;
      const manifest = (await response.json()) as { theme_color?: string; background_color?: string };
      for (const raw of [manifest.theme_color, manifest.background_color]) {
        const color = raw ? parseBrandColor(raw) : null;
        if (color && !isMonoHex(color)) return color;
      }
    } catch {
      // Try next
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
      // Ignore
    }
  }

  for (const url of Array.from(new Set(urls)).slice(0, 3)) {
    try {
      const fetched = await fetchPublic(url, {
        signal: withTimeout(3000, globalSignal),
        headers: { "User-Agent": browserUa, Accept: "image/svg+xml" }
      });
      if (!fetched) continue;
      const { response } = fetched;
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();
      if (!contentType.includes("svg") && !text.includes("<svg")) continue;
      const colors = extractSvgColors(text);
      if (colors.length === 0) continue;
      const nonMono = colors.filter((color) => !isMonoHex(color));
      if (nonMono.length === 0) return { color: null, mono: true };
      return { color: mostSaturated(nonMono), mono: false };
    } catch {
      // Try next
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
      const fetched = await fetchPublic(url, {
        signal: withTimeout(4000, globalSignal),
        headers: { "User-Agent": browserUa, Accept: "image/png" }
      });
      if (!fetched) continue;
      const { response } = fetched;
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("image/png")) continue;
      const color = extractPngAccent(Buffer.from(await response.arrayBuffer()));
      if (color) return color;
    } catch {
      // Try next
    }
  }
  return null;
}

type Signal = { color: string; confidence: number };

async function resolveColor(company: string, ticker?: string, globalSignal?: AbortSignal): Promise<string | null> {
  const domain = await resolveDomain(company, ticker, globalSignal);
  if (!domain) return null;

  const page = await fetchHomepage(domain, globalSignal);
  if (!page) {
    return await fetchLogoAccent(domain, globalSignal);
  }

  const signals: Signal[] = [];

  const svg = await fetchSvgLogoColor(page.html, page.baseUrl, globalSignal);
  if (!svg?.mono && svg?.color) signals.push({ color: svg.color, confidence: 0.85 });

  const manifest = await fetchManifestColor(page.html, page.baseUrl, globalSignal);
  if (manifest) signals.push({ color: manifest, confidence: 0.95 });

  const theme = themeColor(page.html);
  if (theme) signals.push({ color: theme, confidence: 0.9 });

  const css = await fetchAllCss(page.html, page.baseUrl, globalSignal);
  const brandVar = extractBrandVarColor(css);
  if (brandVar) signals.push({ color: brandVar, confidence: 0.85 });
  const dominant = extractTextAccent(page.html + "\n" + css);
  if (dominant && isStrongStatisticalSignal(dominant)) {
    signals.push({ color: dominant.color, confidence: 0.6 });
  }

  if (!signals.some((signal) => signal.confidence >= 0.6)) {
    const jsColor = await fetchJsBundleColor(page.html, page.baseUrl, globalSignal);
    if (jsColor) {
      signals.push({ color: jsColor.color, confidence: 0.55 });
    }
  }

  if (!signals.some((signal) => signal.confidence >= 0.55)) {
    const favicon = await fetchLogoAccent(domain, globalSignal);
    if (favicon) signals.push({ color: favicon, confidence: 0.4 });
  }

  if (signals.length === 0) return null;
  signals.sort((a, b) => b.confidence - a.confidence);
  const best = signals[0];
  if (best.confidence < 0.55 && !signals.some((s) => s !== best && colorClose(s.color, best.color))) {
    return null;
  }
  return best.color;
}

export async function resolveAndCacheBrandColor(company: string, ticker?: string): Promise<string | null> {
  const cleanCompany = company.trim();
  const cleanTicker = ticker?.trim().toUpperCase();
  if (!cleanCompany) return null;
  if (cleanCompany.length > 200 || (cleanTicker && !/^[A-Z0-9.-]{1,20}$/.test(cleanTicker))) {
    return null;
  }

  const direct = await fetchBrandfetchColor({ ticker: cleanTicker });
  if (direct) return direct;

  try {
    const cacheKey = cleanTicker ? `${cleanTicker}:${cleanCompany}` : cleanCompany;
    const cached = await getBrandColor(cacheKey);
    if (cached !== undefined) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT_MS);
    try {
      const color = await resolveColor(cleanCompany, cleanTicker, controller.signal);
      await setBrandColor(cacheKey, color);
      return color;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
