import { NextResponse } from "next/server";
import { z } from "zod";
import { getPositions, setPositions } from "@/lib/kv";
import { weightedAverageCost } from "@/lib/portfolio";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;

const addSchema = z.object({
  ticker: z.string().min(1).max(30).transform((v) => v.toUpperCase()),
  company: z.string().min(1).max(200),
  assetClass: z.enum(["stock", "crypto", "perp"]).optional(),
  shares: z.number().finite().positive(),
  average_cost: z.number().finite().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sector: z.string().min(1).max(100),
  thesis_id: z.string().max(100).optional(),
  coinGeckoId: z.string().max(100).optional(),
  side: z.enum(["long", "short"]).optional(),
  leverage: z.number().finite().positive().optional(),
  margin_mode: z.enum(["isolated", "shared"]).optional(),
  margin_used: z.number().finite().positive().optional(),
  bitstamp_market: z.string().regex(/^[a-z0-9-]{1,40}$/).optional()
});

const updateSchema = addSchema.extend({
  originalTicker: z.string().min(1).max(30).transform((v) => v.toUpperCase()),
  shares: z.number().finite().nonnegative()
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

async function averageCostUsd(position: { average_cost: number; average_cost_usd?: number; currency: string; entry_date?: string }) {
  if (position.average_cost_usd != null) return position.average_cost_usd;
  const rate = await fetchUsdRate(position.currency, position.entry_date);
  return rate != null ? position.average_cost * rate : position.average_cost;
}

async function submittedCostUsd(position: z.infer<typeof addSchema> | z.infer<typeof updateSchema>) {
  if (position.currency === "USD") return position.average_cost;
  const rate = await fetchUsdRate(position.currency, position.entry_date);
  return rate != null ? position.average_cost * rate : undefined;
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const positions = await getPositions();
  const existing = positions.find((p) => p.ticker === parsed.data.ticker);

  const isPerp = parsed.data.assetClass === "perp";

  if (existing && isPerp) {
    // Perp: weighted average entry price, additive quantity + margin
    const totalShares = existing.shares + parsed.data.shares;
    const avgEntry = weightedAverageCost(existing.shares, existing.average_cost, parsed.data.shares, parsed.data.average_cost);
    const totalMargin = (existing.margin_used ?? 0) + (parsed.data.margin_used ?? 0);
    const next = positions.map((position) =>
      position.ticker === parsed.data.ticker
        ? {
            ...position,
            ...parsed.data,
            shares: totalShares,
            average_cost: avgEntry,
            average_cost_usd: avgEntry,
            currency: "USD",
            margin_used: totalMargin > 0 ? totalMargin : undefined
          }
        : position
    );
    await setPositions(next);
    return NextResponse.json({ ok: true, merged: true });
  }

  const average_cost_usd = isPerp ? parsed.data.average_cost : await submittedCostUsd(parsed.data);
  if (existing) {
    const oldCostUsd = await averageCostUsd(existing);
    const newCostUsd = average_cost_usd ?? parsed.data.average_cost;
    const totalShares = existing.shares + parsed.data.shares;
    const weightedAverageUsd = weightedAverageCost(existing.shares, oldCostUsd, parsed.data.shares, newCostUsd);
    const next = positions.map((position) =>
      position.ticker === parsed.data.ticker
        ? {
            ...position,
            ...parsed.data,
            company: parsed.data.company || position.company,
            shares: totalShares,
            average_cost: weightedAverageUsd,
            average_cost_usd: weightedAverageUsd,
            currency: "USD",
            assetClass: parsed.data.assetClass ?? position.assetClass,
            coinGeckoId: parsed.data.coinGeckoId ?? position.coinGeckoId,
            sector: parsed.data.sector || position.sector
          }
        : position
    );
    await setPositions(next);
    return NextResponse.json({ ok: true, merged: true });
  }

  await setPositions([...positions, { ...parsed.data, average_cost_usd }]);
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const positions = await getPositions();
  const exists = positions.some((p) => p.ticker === parsed.data.originalTicker);
  if (!exists) return NextResponse.json({ error: "Position not found" }, { status: 404 });

  const tickerTaken = positions.some((p) => p.ticker === parsed.data.ticker && p.ticker !== parsed.data.originalTicker);
  if (tickerTaken) return NextResponse.json({ error: "Ticker already exists" }, { status: 409 });

  const average_cost_usd = await submittedCostUsd(parsed.data);
  const { originalTicker, ...position } = parsed.data;
  await setPositions(
    positions.map((existing) =>
      existing.ticker === originalTicker ? { ...position, average_cost_usd } : existing
    )
  );
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
