import { z } from "zod";
import type { BitstampPerpQuote, BitstampPerpQuotesByMarket, Candle, NewsItem, Quote, QuotesByTicker } from "./types";

const yahooBase = "https://query1.finance.yahoo.com";
const bitstampBase = "https://www.bitstamp.net";

// --- Yahoo crumb auth ---
// Yahoo v7/v10 endpoints require a session cookie + matching crumb since 2024.
// We fetch both once and cache in module-level state (survives warm requests in dev;
// cold-starts in Vercel serverless refetch, which is acceptable for admin-only scans).
type YahooAuth = { cookie: string; crumb: string; ts: number };
let _yahooAuth: YahooAuth | null = null;

async function getYahooAuth(): Promise<YahooAuth | null> {
  if (_yahooAuth && Date.now() - _yahooAuth.ts < 30 * 60 * 1000) return _yahooAuth;
  try {
    const pageRes = await fetch("https://finance.yahoo.com/", {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      cache: "no-store"
    });
    const rawCookies = pageRes.headers.getSetCookie?.() ?? [];
    const a1 = rawCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("A1="));
    if (!a1) return null;

    const crumbRes = await fetch(`${yahooBase}/v1/test/getcrumb`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "cookie": a1,
        "accept": "*/*",
        "referer": "https://finance.yahoo.com/"
      },
      cache: "no-store"
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (crumb.length < 3 || crumb.includes("<")) return null;

    _yahooAuth = { cookie: a1, crumb, ts: Date.now() };
    return _yahooAuth;
  } catch {
    return null;
  }
}

function yahooHeaders(auth: YahooAuth | null): Record<string, string> {
  return auth
    ? { "user-agent": "Mozilla/5.0", "cookie": auth.cookie }
    : { "user-agent": "Mozilla/5.0" };
}

function withCrumb(url: string, auth: YahooAuth | null): string {
  if (!auth) return url;
  return `${url}${url.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(auth.crumb)}`;
}

// Public read APIs are unauthenticated. Validate ticker shape and clamp counts at the
// route boundary so a crafted request can't fan out into unbounded Yahoo fetches on a
// free Vercel deploy. Yahoo symbols use letters/digits plus `.` (RHM.DE), `-` (BRK-B),
// `=` (EURUSD=X), `^` (^GSPC).
const tickerPattern = /^[A-Z0-9.\-=^]{1,20}$/;
export function isValidTicker(symbol: string): boolean {
  return tickerPattern.test(symbol);
}
export const MAX_QUOTE_SYMBOLS = 60;
export const MAX_PERP_MARKETS = 25;
export const MAX_SEARCH_QUERY = 64;
// Allowlist of Yahoo chart ranges we actually request; anything else falls back to 10y.
export const historyRanges = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"]);

const quoteResultSchema = z.object({
  symbol: z.string(),
  regularMarketPrice: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  regularMarketChange: z.number().nullable().optional(),
  regularMarketChangePercent: z.number().nullable().optional(),
  regularMarketTime: z.number().nullable().optional()
});

const quoteResponseSchema = z.object({
  quoteResponse: z.object({
    result: z.array(quoteResultSchema)
  })
});

const quoteDetailResultSchema = quoteResultSchema.extend({
  shortName: z.string().nullable().optional(),
  longName: z.string().nullable().optional(),
  quoteType: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
  exchDisp: z.string().nullable().optional(),
  fullExchangeName: z.string().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  regularMarketVolume: z.number().nullable().optional(),
  averageDailyVolume3Month: z.number().nullable().optional()
});

const quoteDetailResponseSchema = z.object({
  quoteResponse: z.object({
    result: z.array(quoteDetailResultSchema)
  })
});

const chartResponseSchema = z.object({
  chart: z.object({
    result: z.array(z.any()).nullable()
  })
});

const bitstampPerpMarketPattern = /^[a-z0-9]+usd-perp$/;
export function isValidBitstampPerpMarket(market: string): boolean {
  return bitstampPerpMarketPattern.test(market);
}

export function bitstampPerpMarketSymbol(ticker: string, explicitMarket?: string): string | null {
  const candidate = (explicitMarket || ticker).trim().toLowerCase().replace(/\s+/g, "");
  if (!candidate) return null;
  if (isValidBitstampPerpMarket(candidate)) return candidate;

  const withoutSlash = candidate.replace("/", "");
  if (/^[a-z0-9]+usdperp$/.test(withoutSlash)) return withoutSlash.replace(/usdperp$/, "usd-perp");
  if (/^[a-z0-9]+usd-perp$/.test(withoutSlash)) return withoutSlash;

  const base = withoutSlash
    .replace(/-?perp$/, "")
    .replace(/usd$/, "")
    .replace(/[^a-z0-9]/g, "");
  const inferred = `${base}usd-perp`;
  return base && isValidBitstampPerpMarket(inferred) ? inferred : null;
}

const bitstampTickerSchema = z.object({
  timestamp: z.string().optional(),
  last: z.string().optional(),
  bid: z.string().optional(),
  ask: z.string().optional(),
  market_type: z.string().optional(),
  mark_price: z.string().optional(),
  index_price: z.string().optional(),
  open_interest: z.string().optional(),
  open_interest_value: z.string().optional()
});

const bitstampFundingSchema = z.object({
  funding_rate: z.string().optional(),
  timestamp: z.string().optional(),
  market: z.string().optional(),
  next_funding_time: z.string().optional()
});

export async function fetchBitstampPerpQuotes(markets: string[]): Promise<BitstampPerpQuotesByMarket> {
  const symbols = Array.from(new Set(markets.map((market) => market.trim().toLowerCase()).filter(isValidBitstampPerpMarket))).slice(0, MAX_PERP_MARKETS);
  if (symbols.length === 0) return {};

  const pairs = await Promise.all(
    symbols.map(async (marketSymbol) => {
      try {
        const [tickerResponse, fundingResponse] = await Promise.all([
          fetch(`${bitstampBase}/api/v2/ticker/${encodeURIComponent(marketSymbol)}/`, {
            headers: { accept: "application/json" },
            next: { revalidate: 30 }
          }),
          fetch(`${bitstampBase}/api/v2/funding_rate/${encodeURIComponent(marketSymbol)}/`, {
            headers: { accept: "application/json" },
            next: { revalidate: 30 }
          })
        ]);
        if (!tickerResponse.ok) return null;
        const ticker = bitstampTickerSchema.safeParse(await tickerResponse.json());
        if (!ticker.success || ticker.data.market_type !== "PERPETUAL") return null;

        const funding = fundingResponse.ok
          ? bitstampFundingSchema.safeParse(await fundingResponse.json())
          : null;
        const fundingData = funding?.success ? funding.data : {};

        const quote: BitstampPerpQuote = {
          market_symbol: marketSymbol,
          market: fundingData.market ?? bitstampDisplayMarket(marketSymbol),
          last: parseDecimal(ticker.data.last),
          bid: parseDecimal(ticker.data.bid),
          ask: parseDecimal(ticker.data.ask),
          mark_price: parseDecimal(ticker.data.mark_price),
          index_price: parseDecimal(ticker.data.index_price),
          open_interest: parseDecimal(ticker.data.open_interest),
          open_interest_value: parseDecimal(ticker.data.open_interest_value),
          funding_rate: parseDecimal(fundingData.funding_rate),
          next_funding_time: parseTimestamp(fundingData.next_funding_time),
          timestamp: parseTimestamp(ticker.data.timestamp ?? fundingData.timestamp)
        };

        return [marketSymbol, quote] as const;
      } catch {
        return null;
      }
    })
  );

  return Object.fromEntries(pairs.filter((pair): pair is readonly [string, BitstampPerpQuote] => pair != null));
}

export async function fetchQuotes(tickers: string[]): Promise<QuotesByTicker> {
  if (tickers.length === 0) return {};

  const params = new URLSearchParams({
    symbols: tickers.join(","),
    fields: "regularMarketPrice,currency,regularMarketChange,regularMarketChangePercent,regularMarketTime"
  });

  const response = await fetch(`${yahooBase}/v7/finance/quote?${params}`, {
    headers: { "user-agent": "Mozilla/5.0" },
    next: { revalidate: 30 }
  });

  if (response.status === 401 || response.status === 403) {
    return chartQuotes(tickers);
  }

  if (!response.ok) {
    return {};
  }

  const json = quoteResponseSchema.safeParse(await response.json());
  if (!json.success) return {};

  return Object.fromEntries(json.data.quoteResponse.result.map((raw) => [raw.symbol, normalizeQuote(raw)]));
}

export type QuoteDetail = {
  ticker: string;
  company: string;
  quoteType: string | null;
  exchange: string | null;
  price: number | null;
  marketCap: number | null;
  trailingRevenue: number | null;
  trailingNetIncome: number | null;
  volume: number | null;
  averageVolume: number | null;
};

export async function fetchQuoteDetails(tickers: string[]): Promise<Record<string, QuoteDetail>> {
  const symbols = Array.from(new Set(tickers.filter(isValidTicker))).slice(0, MAX_QUOTE_SYMBOLS);
  if (symbols.length === 0) return {};

  const params = new URLSearchParams({
    symbols: symbols.join(","),
    fields: [
      "shortName",
      "longName",
      "quoteType",
      "exchange",
      "exchDisp",
      "fullExchangeName",
      "regularMarketPrice",
      "marketCap",
      "regularMarketVolume",
      "averageDailyVolume3Month"
    ].join(",")
  });

  const base: Record<string, QuoteDetail> = {};

  // Attempt Yahoo v7 with crumb auth. On any failure, fall through — chart fills the gap.
  try {
    const auth = await getYahooAuth();
    const response = await fetch(withCrumb(`${yahooBase}/v7/finance/quote?${params}`, auth), {
      headers: yahooHeaders(auth),
      next: { revalidate: 120 }
    });
    if (response.ok) {
      const json = quoteDetailResponseSchema.safeParse(await response.json());
      if (json.success) {
        for (const raw of json.data.quoteResponse.result) {
          base[raw.symbol] = {
            ticker: raw.symbol,
            company: raw.longName ?? raw.shortName ?? raw.symbol,
            quoteType: raw.quoteType ?? null,
            exchange: raw.fullExchangeName ?? raw.exchDisp ?? raw.exchange ?? null,
            price: raw.regularMarketPrice ?? null,
            marketCap: raw.marketCap ?? null,
            trailingRevenue: null,
            trailingNetIncome: null,
            volume: raw.regularMarketVolume ?? null,
            averageVolume: raw.averageDailyVolume3Month ?? null
          };
        }
      }
    } else if (response.status === 401 || response.status === 429) {
      _yahooAuth = null;
    }
  } catch {}

  // Chart fallback: fetch for every ticker not already populated from v7.
  const needChart = symbols.filter((s) => !base[s]);
  const chartResults = await Promise.all(needChart.map(fetchChartQuoteDetail));
  for (const detail of chartResults) {
    if (detail) base[detail.ticker] = detail;
  }

  // Skeleton: ensure every requested ticker has at least a minimal entry so FMP can enrich it.
  for (const symbol of symbols) {
    if (!base[symbol]) {
      base[symbol] = { ticker: symbol, company: symbol, quoteType: null, exchange: null, price: null, marketCap: null, trailingRevenue: null, trailingNetIncome: null, volume: null, averageVolume: null };
    }
  }

  // Sequential with pacing — avoids bursting Yahoo's quoteSummary endpoint.
  // Discovery scans are admin-only one-off calls; latency is acceptable.
  const enriched: QuoteDetail[] = [];
  for (const detail of Object.values(base)) {
    enriched.push(await enrichQuoteDetail(detail));
    await new Promise<void>((r) => setTimeout(r, 250));
  }
  return Object.fromEntries(enriched.map((detail) => [detail.ticker, detail]));
}

async function enrichQuoteDetail(detail: QuoteDetail): Promise<QuoteDetail> {
  if (detail.marketCap != null && detail.trailingRevenue != null && detail.trailingNetIncome != null) return detail;
  try {
    const auth = await getYahooAuth();
    const params = new URLSearchParams({ modules: "price,financialData,defaultKeyStatistics,summaryDetail" });
    const url = withCrumb(`${yahooBase}/v10/finance/quoteSummary/${encodeURIComponent(detail.ticker)}?${params}`, auth);
    const response = await fetch(url, {
      headers: yahooHeaders(auth),
      next: { revalidate: 300 }
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 429) _yahooAuth = null;
      return enrichQuoteDetailFromChart(detail);
    }
    const data = await response.json();
    const result = data?.quoteSummary?.result?.[0] ?? {};
    const sharesOutstanding = rawNumber(result?.defaultKeyStatistics?.sharesOutstanding)
      ?? rawNumber(result?.summaryDetail?.sharesOutstanding);
    const price = detail.price ?? rawNumber(result?.price?.regularMarketPrice);
    const estimatedMarketCap = sharesOutstanding != null && price != null ? sharesOutstanding * price : null;
    const enriched: QuoteDetail = {
      ...detail,
      price,
      marketCap: detail.marketCap ?? rawNumber(result?.price?.marketCap) ?? estimatedMarketCap,
      trailingRevenue: detail.trailingRevenue ?? rawNumber(result?.financialData?.totalRevenue),
      trailingNetIncome:
        detail.trailingNetIncome
        ?? rawNumber(result?.defaultKeyStatistics?.netIncomeToCommon)
        ?? rawNumber(result?.financialData?.netIncomeToCommon)
    };
    if (enriched.marketCap == null) {
      const chartDetail = await fetchChartQuoteDetail(detail.ticker);
      if (chartDetail?.marketCap != null) enriched.marketCap = chartDetail.marketCap;
    }
    return enriched;
  } catch {
    return enrichQuoteDetailFromChart(detail);
  }
}

async function enrichQuoteDetailFromChart(detail: QuoteDetail): Promise<QuoteDetail> {
  const chartDetail = await fetchChartQuoteDetail(detail.ticker);
  if (!chartDetail) return detail;
  return {
    ...detail,
    company: detail.company || chartDetail.company,
    exchange: detail.exchange ?? chartDetail.exchange,
    price: detail.price ?? chartDetail.price,
    marketCap: detail.marketCap ?? chartDetail.marketCap,
    trailingNetIncome: detail.trailingNetIncome ?? chartDetail.trailingNetIncome,
    volume: detail.volume ?? chartDetail.volume,
    averageVolume: detail.averageVolume ?? chartDetail.averageVolume
  };
}

async function fetchChartQuoteDetail(ticker: string): Promise<QuoteDetail | null> {
  try {
    const response = await fetch(`${yahooBase}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`, {
      headers: { "user-agent": "Mozilla/5.0" },
      next: { revalidate: 300 }
    });
    if (!response.ok) return null;
    const json = chartResponseSchema.safeParse(await response.json());
    const meta = json.success ? json.data.chart.result?.[0]?.meta : null;
    if (!meta) return null;
    const symbol = typeof meta.symbol === "string" ? meta.symbol : ticker;
    return {
      ticker: symbol,
      company: typeof meta.longName === "string" ? meta.longName : typeof meta.shortName === "string" ? meta.shortName : symbol,
      quoteType: typeof meta.instrumentType === "string" ? meta.instrumentType : null,
      exchange: typeof meta.fullExchangeName === "string" ? meta.fullExchangeName : typeof meta.exchangeName === "string" ? meta.exchangeName : null,
      price: numberOrNull(meta.regularMarketPrice),
      marketCap: numberOrNull(meta.marketCap),
      trailingRevenue: null,
      trailingNetIncome: null,
      volume: numberOrNull(meta.regularMarketVolume),
      averageVolume: numberOrNull(meta.averageDailyVolume3Month)
    };
  } catch {
    return null;
  }
}

function rawNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof (value as { raw?: unknown }).raw === "number") return (value as { raw: number }).raw;
  return null;
}

// FMP stable/profile returns an array of profile objects.
// The exact field name for market cap varies by endpoint version — accept both.
const fmpProfileSchema = z.array(
  z.object({
    marketCap: z.number().nullable().optional(),
    mktCap: z.number().nullable().optional()
  })
);

async function fetchFmpProfile(ticker: string): Promise<{ marketCap: number | null }> {
  const empty = { marketCap: null };
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return empty;
  try {
    const response = await fetch(
      `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`,
      { headers: { "user-agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!response.ok) {
      console.error(`[FMP] ${ticker} HTTP ${response.status}`);
      return empty;
    }
    const raw = await response.json();
    const parsed = fmpProfileSchema.safeParse(raw);
    if (!parsed.success || parsed.data.length === 0) {
      // Log first item keys so we know what FMP actually returned
      if (Array.isArray(raw) && raw.length > 0) {
        console.error(`[FMP] ${ticker} schema mismatch — keys: ${Object.keys(raw[0]).join(", ")}`);
      } else {
        console.error(`[FMP] ${ticker} empty or unexpected response:`, JSON.stringify(raw).slice(0, 200));
      }
      return empty;
    }
    const cap = parsed.data[0].marketCap ?? parsed.data[0].mktCap ?? null;
    return { marketCap: cap };
  } catch (err) {
    console.error(`[FMP] ${ticker} fetch error:`, err);
    return empty;
  }
}

export async function enrichDetailsWithFmp(details: Record<string, QuoteDetail>): Promise<void> {
  const needsCap = Object.values(details).filter((d) => d.marketCap == null);
  if (needsCap.length === 0) return;
  await Promise.all(
    needsCap.map(async (detail) => {
      const fmp = await fetchFmpProfile(detail.ticker);
      const d = details[detail.ticker];
      if (!d) return;
      if (fmp.marketCap != null) d.marketCap = fmp.marketCap;
    })
  );
}

// ── CoinGecko ──────────────────────────────────────────────────────────────

export async function fetchCoinGeckoQuotes(
  entries: Array<{ id: string; symbol: string }>
): Promise<QuotesByTicker> {
  if (entries.length === 0) return {};
  const ids = entries.map((e) => e.id).join(",");
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 30 }
    });
    if (!res.ok) return {};
    const data = await res.json();
    const result: QuotesByTicker = {};
    for (const { id, symbol } of entries) {
      const row = data[id];
      if (!row || typeof row.usd !== "number") continue;
      const price = row.usd as number;
      const changePercent: number | null = typeof row.usd_24h_change === "number" ? row.usd_24h_change : null;
      const change =
        changePercent != null ? (price * changePercent) / (100 + changePercent) : null;
      result[symbol] = {
        ticker: symbol,
        price,
        currency: "USD",
        regular_market_change: change,
        regular_market_change_percent: changePercent,
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
    return result;
  } catch {
    return {};
  }
}

export async function fetchCoinGeckoHistory(id: string, range = "1mo"): Promise<Candle[]> {
  const days = coingeckoDaysFor(range);
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/ohlc?vs_currency=usd&days=${days}`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 }
    });
    if (!res.ok) return [];
    const data: number[][] = await res.json();
    if (!Array.isArray(data)) return [];
    return data.flatMap(([ts, open, high, low, close]) => {
      if (ts == null || open == null || high == null || low == null || close == null) return [];
      return [{ time: Math.floor(ts / 1000), open, high, low, close }];
    });
  } catch {
    return [];
  }
}

function coingeckoDaysFor(range: string): number | "max" {
  if (range === "1d") return 1;
  if (range === "5d") return 7;
  if (range === "1mo") return 30;
  if (range === "3mo") return 90;
  if (range === "6mo") return 180;
  if (range === "max") return "max";
  return 365;
}

// ── Yahoo Finance history ───────────────────────────────────────────────────

export async function fetchHistory(ticker: string, range = "1mo"): Promise<Candle[]> {
  const params = new URLSearchParams({ range, interval: intervalFor(range) });
  const response = await fetch(`${yahooBase}/v8/finance/chart/${encodeURIComponent(ticker)}?${params}`, {
    headers: { "user-agent": "Mozilla/5.0" },
    next: { revalidate: 300 }
  });

  if (!response.ok) return [];

  const json = chartResponseSchema.safeParse(await response.json());
  const result = json.success ? json.data.chart.result?.[0] : null;
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const ohlcv = result.indicators?.quote?.[0] ?? {};
  const opens: Array<number | null> = ohlcv.open ?? [];
  const highs: Array<number | null> = ohlcv.high ?? [];
  const lows: Array<number | null> = ohlcv.low ?? [];
  const closes: Array<number | null> = ohlcv.close ?? [];

  return timestamps.flatMap((time, index) => {
    const open = opens[index];
    const high = highs[index];
    const low = lows[index];
    const close = closes[index];

    if (open == null || high == null || low == null || close == null) return [];
    return [{ time, open, high, low, close }];
  });
}

const newsResponseSchema = z.object({
  news: z.array(
    z.object({
      title: z.string(),
      link: z.string(),
      publisher: z.string(),
      providerPublishTime: z.number()
    })
  )
});

export async function fetchNews(ticker: string): Promise<NewsItem[]> {
  const params = new URLSearchParams({ q: ticker, newsCount: "8", newsStart: "0" });
  const response = await fetch(`${yahooBase}/v1/finance/search?${params}`, {
    headers: { "user-agent": "Mozilla/5.0" },
    next: { revalidate: 300 }
  });

  if (!response.ok) return [];

  const json = newsResponseSchema.safeParse(await response.json());
  if (!json.success) return [];

  return json.data.news.map((item) => ({
    title: item.title,
    link: item.link,
    publisher: item.publisher,
    publishedAt: item.providerPublishTime
  }));
}

async function chartQuotes(tickers: string[]): Promise<QuotesByTicker> {
  const pairs = await Promise.all(
    tickers.map(async (ticker) => {
      const response = await fetch(`${yahooBase}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`, {
        headers: { "user-agent": "Mozilla/5.0" },
        next: { revalidate: 30 }
      });

      if (!response.ok) return null;
      const json = chartResponseSchema.safeParse(await response.json());
      const meta = json.success ? json.data.chart.result?.[0]?.meta : null;
      if (!meta) return null;

      const price = numberOrNull(meta.regularMarketPrice);
      const previousClose = numberOrNull(meta.previousClose ?? meta.chartPreviousClose);
      const change = price != null && previousClose != null ? price - previousClose : null;
      const percent = change != null && previousClose ? (change / previousClose) * 100 : null;

      return [
        ticker,
        {
          ticker,
          price,
          currency: meta.currency ?? null,
          regular_market_change: change,
          regular_market_change_percent: percent,
          timestamp: numberOrNull(meta.regularMarketTime)
        }
      ] as const;
    })
  );

  return Object.fromEntries(pairs.filter((pair): pair is readonly [string, Quote] => pair != null));
}

function normalizeQuote(raw: z.infer<typeof quoteResultSchema>): Quote {
  return {
    ticker: raw.symbol,
    price: raw.regularMarketPrice ?? null,
    currency: raw.currency ?? null,
    regular_market_change: raw.regularMarketChange ?? null,
    regular_market_change_percent: raw.regularMarketChangePercent ?? null,
    timestamp: raw.regularMarketTime ?? null
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function parseDecimal(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function bitstampDisplayMarket(marketSymbol: string): string {
  return marketSymbol.replace(/([a-z0-9]+)usd-perp/, (_, base: string) => `${base.toUpperCase()}/USD-PERP`);
}

function intervalFor(range: string): string {
  if (range === "1d") return "5m";
  if (range === "5d") return "15m";
  if (range === "5y" || range === "10y" || range === "max") return "1wk";
  return "1d";
}
