import { NextResponse } from "next/server";
import { fetchQuotes, isValidTicker, MAX_QUOTE_SYMBOLS } from "@/lib/market";

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

  return NextResponse.json(await fetchQuotes(symbols));
}
