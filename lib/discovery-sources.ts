import { z } from "zod";
import type { DiscoverySectorConfig } from "./discovery-sectors";
import { MAX_SEARCH_QUERY, isValidTicker } from "./market";
import { isSafePublicUrl } from "./ssrf";

export type DiscoveryArticle = {
  title: string;
  url: string;
  domain: string;
  publishedAt: number | null;
  sourceCountry?: string;
  relatedTickers?: string[];
};

export type ResolvedArticleCandidate = {
  ticker: string;
  company: string;
  exchange: string | null;
  article: DiscoveryArticle;
};

export type DiscoveryCandidateGroup = {
  ticker: string;
  company: string;
  exchange: string | null;
  articles: DiscoveryArticle[];
};

const gdeltArticleSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  domain: z.string().optional(),
  seendate: z.string().optional(),
  sourcecountry: z.string().optional()
});

const gdeltResponseSchema = z.object({
  articles: z.array(gdeltArticleSchema).optional()
});

const yahooSearchSchema = z.object({
  quotes: z
    .array(
      z.object({
        symbol: z.string().optional(),
        shortname: z.string().optional(),
        longname: z.string().optional(),
        quoteType: z.string().optional(),
        exchDisp: z.string().optional()
      })
    )
    .optional()
});

const yahooNewsSearchSchema = z.object({
  news: z
    .array(
      z.object({
        title: z.string().optional(),
        link: z.string().url().optional(),
        publisher: z.string().optional(),
        providerPublishTime: z.number().optional(),
        relatedTickers: z.array(z.string()).optional()
      })
    )
    .optional()
});

export async function fetchSectorArticles(sector: DiscoverySectorConfig): Promise<DiscoveryArticle[]> {
  const [gdeltArticles, googleArticles, yahooArticles] = await Promise.all([
    fetchGdeltSectorArticles(sector),
    fetchGoogleNewsSectorArticles(sector),
    fetchYahooSectorArticles(sector)
  ]);
  const seen = new Set<string>();
  return [...gdeltArticles, ...googleArticles, ...yahooArticles].filter((article) => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return !isNoiseArticle(article);
  });
}

async function fetchGdeltSectorArticles(sector: DiscoverySectorConfig): Promise<DiscoveryArticle[]> {
  try {
    const sectorQuery = sector.terms.map((term) => quoteQueryTerm(term)).join(" OR ");
    const params = new URLSearchParams({
      query: `(${sectorQuery}) -invests -wealth -stake -adviser -advisor -holdings`,
      mode: "artlist",
      format: "json",
      maxrecords: "75",
      timespan: "12months",
      sort: "datedesc"
    });

    const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {
      headers: { "user-agent": "TheNextSemis/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(9000)
    });

    if (!response.ok) return [];

    const parsed = gdeltResponseSchema.safeParse(await response.json());
    if (!parsed.success) return [];

    return (parsed.data.articles ?? []).flatMap((article) => {
      if (!article.title || !article.url || !isHttpUrl(article.url)) return [];
      return [
        {
          title: article.title,
          url: article.url,
          domain: article.domain ?? safeDomain(article.url),
          publishedAt: parseGdeltDate(article.seendate),
          sourceCountry: article.sourcecountry
        }
      ];
    });
  } catch {
    return [];
  }
}

async function fetchYahooSectorArticles(sector: DiscoverySectorConfig): Promise<DiscoveryArticle[]> {
  const queries = sectorNewsQueries(sector).slice(0, 6);
  const batches = await Promise.all(queries.map((query) => fetchYahooNewsArticles(query, sector, 12)));
  return dedupeArticles(batches.flat());
}

async function fetchYahooNewsArticles(query: string, sector: DiscoverySectorConfig, maxItems: number): Promise<DiscoveryArticle[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      quotesCount: "6",
      newsCount: String(maxItems)
    });
    const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?${params}`, {
      headers: { Accept: "application/json", "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) return [];

    const parsed = yahooNewsSearchSchema.safeParse(await response.json());
    if (!parsed.success) return [];

    return (parsed.data.news ?? []).flatMap((article) => {
      if (!article.title || !article.link || !isHttpUrl(article.link)) return [];
      const candidate = {
        title: article.title,
        url: article.link,
        domain: safeDomain(article.link) || article.publisher || "",
        publishedAt: article.providerPublishTime ?? null,
        relatedTickers: (article.relatedTickers ?? []).filter(isValidTicker)
      };
      if (!articleLooksRelevant(candidate, sector)) return [];
      return [candidate];
    });
  } catch {
    return [];
  }
}

async function fetchGoogleNewsSectorArticles(sector: DiscoverySectorConfig): Promise<DiscoveryArticle[]> {
  const batches = await Promise.all(sectorNewsQueries(sector).slice(0, 8).map((query) => fetchGoogleNewsArticles(query, 10)));
  return dedupeArticles(batches.flat()).filter((article) => articleLooksRelevant(article, sector));
}

export async function fetchCompanySectorEvidence(company: string, ticker: string, sector: DiscoverySectorConfig): Promise<DiscoveryArticle[]> {
  const cleanCompany = company.replace(/\b(Inc\.?|Corporation|Corp\.?|Company|Co\.?|Holdings|Limited|Ltd\.?|plc|PLC|AG|S\.A\.|N\.V\.)\b/g, "").trim();
  const queries = sector.companyEvidenceQueries.slice(0, 3).map((query) => `"${cleanCompany}" ${query}`);
  queries.push(`"${ticker}" ${sector.terms[0]}`);
  const batches = await Promise.all(queries.map((query) => fetchGoogleNewsArticles(query, 5)));
  const seen = new Set<string>();
  return batches
    .flat()
    .filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return articleLooksRelevant(article, sector) && !isNoiseArticle(article);
    })
    .slice(0, 6);
}

async function fetchGoogleNewsArticles(query: string, maxItems: number): Promise<DiscoveryArticle[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      hl: "en-US",
      gl: "US",
      ceid: "US:en"
    });
    const response = await fetch(`https://news.google.com/rss/search?${params}`, {
      headers: { "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return [];

    const xml = await response.text();
    return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))
      .slice(0, maxItems)
      .flatMap((match) => {
        const item = match[1];
        const title = decodeHtml(xmlTag(item, "title"));
        const url = decodeHtml(xmlTag(item, "link"));
        const source = decodeHtml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "");
        const publishedAt = Date.parse(decodeHtml(xmlTag(item, "pubDate")));
        if (!title || !url || !isHttpUrl(url)) return [];
        return [
          {
            title,
            url,
            domain: source || safeDomain(url),
            publishedAt: Number.isFinite(publishedAt) ? Math.floor(publishedAt / 1000) : null
          }
        ];
      });
  } catch {
    return [];
  }
}

function sectorNewsQueries(sector: DiscoverySectorConfig): string[] {
  const catalysts = sector.catalysts.slice(0, 5);
  const primary = sector.terms.slice(0, 10).flatMap((term, index) => {
    const catalyst = catalysts[index % Math.max(1, catalysts.length)] ?? "contract";
    return [
      `${quoteQueryTerm(term)} ${catalyst} stock`,
      `${quoteQueryTerm(term)} public company ${catalyst}`
    ];
  });
  const evidence = sector.companyEvidenceQueries.map((query) => `${query} stock`);
  const broad = [
    `${quoteQueryTerm(sector.theme)} stock contract`,
    `${quoteQueryTerm(sector.theme)} public company award`
  ];
  return dedupeStrings([...evidence, ...primary, ...broad]).slice(0, 18);
}

function dedupeArticles(articles: DiscoveryArticle[]): DiscoveryArticle[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return !isNoiseArticle(article);
  });
}

export async function resolveArticleCandidates(articles: DiscoveryArticle[], sector: DiscoverySectorConfig): Promise<ResolvedArticleCandidate[]> {
  const direct = articles.flatMap((article) =>
    (article.relatedTickers ?? []).map((ticker) => ({
      ticker,
      company: ticker,
      exchange: null,
      article
    }))
  );

  const pairs = await mapInBatches(articles.slice(0, 50), 4, async (article) => {
    const entityQueries = await entityQueriesForArticle(article);
    const suggestionsByQuery = await Promise.all(
      entityQueries.slice(0, 7).map(async (query) => ({
        query,
        suggestions: await searchListedEquities(query)
      }))
    );

    return dedupeSuggestions(
      suggestionsByQuery.flatMap(({ query, suggestions }) =>
        suggestions
          .filter((suggestion) => queryMatchesCompany(query, suggestion.company, suggestion.ticker))
          .map((suggestion) => ({ ...suggestion, query }))
      )
    )
      .filter((suggestion) => articleLooksRelevant(article, sector) && titleMatchesCompany(article.title, suggestion.company, suggestion.ticker))
      .slice(0, 3)
      .map(({ ticker, company, exchange }) => ({ ticker, company, exchange, article }));
  });

  const seen = new Set<string>();
  return [...direct, ...pairs.flat()].filter((candidate) => {
    const key = `${candidate.ticker}:${candidate.article.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function entityQueriesForArticle(article: DiscoveryArticle): Promise<string[]> {
  const html = await fetchArticleHtml(article.url);
  const text = [article.title, html ? extractReadableText(html) : ""].join(" ");
  const entities = extractLikelyCompanyNames(text);
  return dedupeStrings([...titleCompanyQueries(article.title), ...entities, article.title]).filter(Boolean);
}

async function fetchArticleHtml(url: string): Promise<string | null> {
  try {
    let current = url;
    for (let hop = 0; hop < 3; hop += 1) {
      if (!(await isSafePublicUrl(current))) return null;
      const response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; TheNextSemisBot/1.0)" },
        signal: AbortSignal.timeout(5000)
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) return null;
      const text = await response.text();
      return text.slice(0, 180_000);
    }
    return null;
  } catch {
    return null;
  }
}

function extractReadableText(html: string): string {
  const meta = Array.from(html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title|description|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1])
    .join(" ");
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 16000);
  return decodeHtml(`${title} ${meta} ${body}`);
}

function extractLikelyCompanyNames(text: string): string[] {
  const compact = text.replace(/\s+/g, " ");
  const matches = Array.from(
    compact.matchAll(
      /\b([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,4}\s+(?:Inc|Corp|Corporation|Company|Holdings|Technologies|Technology|Systems|Group|Limited|Ltd|plc|PLC|AG|S\.A\.|SA|N\.V\.|NV))\b/g
    )
  ).map((match) => match[1]);

  const shortBrandMatches = Array.from(
    compact.matchAll(/\b([A-Z][A-Za-z0-9&.\-]{3,24})\s+(?:wins|secures|awarded|selected|receives|lands|announces)\b/g)
  ).map((match) => match[1]);

  return Array.from(new Set([...matches, ...shortBrandMatches]))
    .filter((name) => !entityNoise.has(normalize(name)))
    .slice(0, 16);
}

function titleCompanyQueries(title: string): string[] {
  const clean = title
    .split(/\s+-\s+/)[0]
    .replace(/\|.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const patterns = [
    /^(.+?)\s+(?:announces|reports|wins|secures|awarded|selected|receives|lands|initiates|completes|gets|obtains|partners|launches|expands|signs|files|gains|meets)\b/i,
    /^Why\s+(.+?)\s+stock\b/i,
    /^(.+?)\s+stock\s+(?:rises|falls|surges|crashes|jumps|slumps)\b/i,
    /^(.+?)\s+(?:CEO|CFO|shares|investor|trial|contract|order|approval)\b/i
  ];
  const candidates = patterns.flatMap((pattern) => {
    const match = clean.match(pattern);
    return match?.[1] ? [match[1]] : [];
  });

  const capitalizedPrefix = clean.match(/^([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})\b/)?.[1];
  if (capitalizedPrefix) candidates.push(capitalizedPrefix);

  return dedupeStrings(
    candidates
      .map((candidate) => candidate.replace(/^(The|A|An)\s+/i, "").trim())
      .filter((candidate) => candidate.length >= 3 && !entityNoise.has(normalize(candidate)))
  ).slice(0, 8);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeSuggestions<T extends { ticker: string }>(suggestions: T[]): T[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.ticker)) return false;
    seen.add(suggestion.ticker);
    return true;
  });
}

async function mapInBatches<T, R>(items: T[], batchSize: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    results.push(...(await Promise.all(items.slice(index, index + batchSize).map(mapper))));
  }
  return results;
}

async function searchListedEquities(query: string): Promise<Array<{ ticker: string; company: string; exchange: string | null }>> {
  const q = query.replace(/[^\w .,&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_QUERY);
  if (!q) return [];

  const params = new URLSearchParams({ q, quotesCount: "6", newsCount: "0" });
  const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?${params}`, {
    headers: { Accept: "application/json", "user-agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) return [];

  const parsed = yahooSearchSchema.safeParse(await response.json());
  if (!parsed.success) return [];

  return (parsed.data.quotes ?? [])
    .filter((quote) => quote.quoteType === "EQUITY" && quote.symbol && isValidTicker(quote.symbol))
    .map((quote) => ({
      ticker: quote.symbol as string,
      company: quote.longname ?? quote.shortname ?? (quote.symbol as string),
      exchange: quote.exchDisp ?? null
    }));
}

function titleMatchesCompany(title: string, company: string, ticker: string): boolean {
  return queryMatchesCompany(title, company, ticker);
}

function queryMatchesCompany(query: string, company: string, ticker: string): boolean {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.includes(normalize(ticker))) return true;

  const tokens = normalize(company)
    .split(" ")
    .filter((token) => token.length >= 4 && !companyStopWords.has(token));
  const matchCount = tokens.slice(0, 3).filter((token) => normalizedQuery.includes(token)).length;
  // Multi-word companies require ≥2 token matches to avoid false positives from common English words
  return tokens.length >= 2 ? matchCount >= 2 : matchCount >= 1;
}

function articleLooksRelevant(article: DiscoveryArticle, sector: DiscoverySectorConfig | null): boolean {
  const title = normalize(article.title);
  const terms = sector ? [...sector.terms, ...sector.catalysts] : allSectorRelevanceTerms;
  return terms.some((term) => title.includes(normalize(term)));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function parseGdeltDate(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value.replace(/^(\d{4})(\d{2})(\d{2})T/, "$1-$2-$3T"));
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function isNoiseArticle(article: DiscoveryArticle): boolean {
  const title = normalize(article.title);
  const domain = article.domain.toLowerCase();
  return (
    financeNoiseTerms.some((term) => title.includes(term)) ||
    financeNoiseDomains.some((suffix) => domain.endsWith(suffix))
  );
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function xmlTag(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "";
}

const companyStopWords = new Set([
  "inc",
  "corp",
  "corporation",
  "company",
  "limited",
  "holdings",
  "holding",
  "technologies",
  "technology",
  "systems",
  "group",
  "plc",
  "ltd",
  "sa",
  "ag"
]);

const financeNoiseTerms = ["invests", "wealth", "stake", "holdings boosted", "shares bought", "shares sold"];
const financeNoiseDomains = ["tickerreport.com", "marketbeat.com", "defenseworld.net", "etfdailynews.com"];
const entityNoise = new Set(["united states", "business wire", "pr newswire", "yahoo finance"]);
const allSectorRelevanceTerms = [
  "contract", "procurement", "award", "order", "funding", "approval", "partnership", "production",
  "counter drone", "counter-drone", "c uas", "battery", "grid", "nuclear", "rare earth", "lithium",
  "clinical trial", "fda", "semiconductor", "data center", "satellite", "cybersecurity", "robotics",
  "advanced packaging", "hbm", "foundry", "ai accelerator", "liquid cooling", "optical networking",
  "metrology", "eda", "chip equipment", "identity security", "cloud security", "post quantum",
  "warehouse automation", "surgical robot", "autonomous mobile robot", "mineral processing",
  "offtake", "power purchase agreement", "transformer", "substation", "machine vision"
];

function quoteQueryTerm(term: string): string {
  return /\s|-/.test(term) ? `"${term}"` : term;
}

const negativeKeywords = [
  "downgrade", "miss", "misses", "loss", "losses", "sec ", "lawsuit",
  "dilut", "concern", "warning", "cut ", "investigation", "probe",
  "fraud", "bankruptcy", "recall", "resign", "layoff", "restructur",
  "delist", "delisted", "delisting", "reverse split", "going concern",
  "halted", "suspended", "chapter 11", "chapter 7", "receivership",
  "default", "insolvency", "insolvent", "wind down", "cease operations"
];

export async function detectNegativeArticles(
  ticker: string,
  _company: string
): Promise<DiscoveryArticle[]> {
  try {
    const { fetchNews } = await import("./market");
    const news = await fetchNews(ticker);
    return news
      .filter((item) => {
        const title = item.title.toLowerCase();
        return negativeKeywords.some((kw) => title.includes(kw));
      })
      .slice(0, 5)
      .map((item) => ({
        title: item.title,
        url: item.link,
        domain: safeDomain(item.link),
        publishedAt: item.publishedAt,
        relatedTickers: [ticker]
      }));
  } catch {
    return [];
  }
}
