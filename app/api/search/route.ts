import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json([]);

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();

    const suggestions = ((data.quotes as Record<string, string>[]) ?? [])
      .filter((quote) => quote.quoteType === "EQUITY")
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
