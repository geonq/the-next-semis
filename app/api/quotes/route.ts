import { NextResponse } from "next/server";
import { fetchCoinGeckoQuotes, fetchQuotes, isValidTicker, MAX_QUOTE_SYMBOLS } from "@/lib/market";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = Array.from(
    new Set(
      (searchParams.get("symbols") ?? "")
        .split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(isValidTicker)
    )
  ).slice(0, MAX_QUOTE_SYMBOLS);

  const cgParam = searchParams.get("coingecko") ?? "";
  const cgEntries = cgParam
    ? cgParam
        .split(",")
        .flatMap((pair) => {
          const [id, symbol] = pair.split(":");
          return id && symbol ? [{ id: id.trim(), symbol: symbol.trim().toUpperCase() }] : [];
        })
        .slice(0, 20)
    : [];

  const [yahooQuotes, cgQuotes] = await Promise.all([
    fetchQuotes(symbols),
    fetchCoinGeckoQuotes(cgEntries)
  ]);

  return NextResponse.json({ ...yahooQuotes, ...cgQuotes });
}
