import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/market";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  return NextResponse.json(await fetchQuotes(symbols));
}
