import { NextResponse } from "next/server";
import { fetchNews } from "@/lib/market";

export async function GET(_request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return NextResponse.json(await fetchNews(ticker.toUpperCase()));
}
