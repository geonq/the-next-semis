import { NextResponse } from "next/server";
import { MAX_SEARCH_QUERY } from "@/lib/market";

type YahooQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
};

type CoinGeckoCoin = {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number | null;
};

function assetTypeFor(quoteType: string | undefined) {
  if (quoteType === "CRYPTOCURRENCY") return "crypto";
  if (quoteType === "ETF") return "etf";
  return "equity";
}

function quoteSortRank(quoteType: string | undefined) {
  if (quoteType === "EQUITY") return 0;
  if (quoteType === "ETF") return 1;
  return 3;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const assetClass = searchParams.get("assetClass") === "crypto" ? "crypto" : "stock";
  if (!q || q.length < 1 || q.length > MAX_SEARCH_QUERY) return NextResponse.json([]);

  try {
    if (assetClass === "crypto") {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
        { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) return NextResponse.json([]);
      const data = await res.json();
      const coins: CoinGeckoCoin[] = (data.coins ?? []).slice(0, 6);
      return NextResponse.json(
        coins.map((coin) => ({
          ticker: coin.symbol.toUpperCase(),
          company: coin.name,
          exchange: "Crypto",
          assetType: "crypto",
          coinGeckoId: coin.id
        }))
      );
    }

    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();

    const quotes = ((data.quotes as YahooQuote[]) ?? []).filter(
      (quote) => quote.quoteType === "EQUITY" || quote.quoteType === "ETF"
    );
    const suggestions = quotes
      .sort((a, b) => quoteSortRank(a.quoteType) - quoteSortRank(b.quoteType))
      .slice(0, 6)
      .map((quote) => ({
        ticker: quote.symbol,
        company: quote.shortname ?? quote.longname ?? "",
        exchange: quote.exchDisp ?? "",
        assetType: assetTypeFor(quote.quoteType)
      }));

    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json([]);
  }
}
