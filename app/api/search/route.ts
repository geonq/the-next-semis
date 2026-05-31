import { NextResponse } from "next/server";
import { MAX_SEARCH_QUERY } from "@/lib/market";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 1 || q.length > MAX_SEARCH_QUERY) return NextResponse.json([]);

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();

    const quotes = ((data.quotes as Record<string, string>[]) ?? []).filter((quote) =>
      quote.quoteType === "EQUITY" || quote.quoteType === "ETF"
    );
    const suggestions = quotes
      .sort((a, b) => (a.quoteType === "EQUITY" ? 0 : 1) - (b.quoteType === "EQUITY" ? 0 : 1))
      .slice(0, 6)
      .map((quote) => ({
        ticker: quote.symbol,
        company: quote.shortname ?? quote.longname ?? "",
        exchange: quote.exchDisp ?? ""
      }));

    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json([]);
  }
}
