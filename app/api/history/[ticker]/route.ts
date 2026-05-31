import { NextResponse } from "next/server";
import { fetchHistory, historyRanges, isValidTicker } from "@/lib/market";

export async function GET(request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  if (!isValidTicker(symbol)) return NextResponse.json([]);

  const requested = new URL(request.url).searchParams.get("range") ?? "10y";
  const range = historyRanges.has(requested) ? requested : "10y";
  return NextResponse.json(await fetchHistory(symbol, range));
}
