import { z } from "zod";
import type { Candle, NewsItem, Quote, QuotesByTicker } from "./types";

const yahooBase = "https://query1.finance.yahoo.com";

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

const chartResponseSchema = z.object({
  chart: z.object({
    result: z.array(z.any()).nullable()
  })
});

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

function intervalFor(range: string): string {
  if (range === "1d") return "5m";
  if (range === "5d") return "15m";
  if (range === "5y" || range === "10y" || range === "max") return "1wk";
  return "1d";
}
