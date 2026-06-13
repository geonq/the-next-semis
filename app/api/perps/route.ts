import { NextResponse } from "next/server";
import { fetchBitstampPerpQuotes, isValidBitstampPerpMarket, MAX_PERP_MARKETS } from "@/lib/market";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const markets = Array.from(
    new Set(
      (searchParams.get("markets") ?? "")
        .split(",")
        .map((market) => market.trim().toLowerCase())
        .filter(isValidBitstampPerpMarket)
    )
  ).slice(0, MAX_PERP_MARKETS);

  return NextResponse.json(await fetchBitstampPerpQuotes(markets));
}
