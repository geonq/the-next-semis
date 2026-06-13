import { NextResponse } from "next/server";
import { z } from "zod";
import { getPositions, setPositions } from "@/lib/kv";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;

const addSchema = z.object({
  ticker: z.string().min(1).max(20).transform((v) => v.toUpperCase()),
  company: z.string().min(1).max(200),
  assetClass: z.enum(["stock", "crypto"]).optional(),
  shares: z.number().finite(),
  average_cost: z.number().finite(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sector: z.string().min(1).max(100),
  thesis_id: z.string().max(100).optional(),
  coinGeckoId: z.string().max(100).optional()
});

async function fetchUsdRate(from: string, date?: string): Promise<number | null> {
  if (from === "USD") return 1;
  const endpoint = date
    ? `https://api.frankfurter.app/${date}?from=${encodeURIComponent(from)}&to=USD`
    : `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=USD`;
  try {
    const res = await fetch(endpoint, { cache: date ? "force-cache" : "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.rates?.USD === "number" ? data.rates.USD : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const positions = await getPositions();
  const exists = positions.some((p) => p.ticker === parsed.data.ticker);
  if (exists) return NextResponse.json({ error: "Ticker already exists" }, { status: 409 });

  let average_cost_usd: number | undefined;
  if (parsed.data.currency === "USD") {
    average_cost_usd = parsed.data.average_cost;
  } else {
    const rate = await fetchUsdRate(parsed.data.currency, parsed.data.entry_date);
    if (rate != null) average_cost_usd = parsed.data.average_cost * rate;
  }

  await setPositions([...positions, { ...parsed.data, average_cost_usd }]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { ticker } = await request.json();
  if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

  const positions = await getPositions();
  const next = positions.filter((p) => p.ticker !== ticker.toUpperCase());
  await setPositions(next);
  return NextResponse.json({ ok: true });
}
