import { NextResponse } from "next/server";
import { resolveAndCacheBrandColor } from "@/lib/brand-color-resolver";

export const runtime = "nodejs";

const cacheHeaders = {
  "Cache-Control": "no-store"
};

function colorResponse(color: string | null) {
  return NextResponse.json({ color }, { headers: cacheHeaders });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company")?.trim();
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  if (!company) return colorResponse(null);
  if (company.length > 200 || (ticker && !/^[A-Z0-9.-]{1,20}$/.test(ticker))) {
    return colorResponse(null);
  }

  const color = await resolveAndCacheBrandColor(company, ticker);
  return colorResponse(color);
}
