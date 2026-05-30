import { NextResponse } from "next/server";
import { fetchHistory } from "@/lib/market";

export async function GET(request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "10y";
  return NextResponse.json(await fetchHistory(ticker.toUpperCase(), range));
}
