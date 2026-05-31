import { NextResponse } from "next/server";
import { fetchNews, isValidTicker } from "@/lib/market";

export async function GET(_request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  if (!isValidTicker(symbol)) return NextResponse.json([]);
  return NextResponse.json(await fetchNews(symbol));
}
