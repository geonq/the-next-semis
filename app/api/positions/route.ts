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
  staking_provider: z.string().max(80).optional(),
  staked_amount: z.number().finite().nonnegative().optional(),
  staking_apy: z.number().finite().nonnegative().optional(),
  side: z.enum(["long", "short"]).optional(),
  leverage: z.number().finite().positive().optional(),
  margin_mode: z.enum(["isolated", "shared"]).optional(),
  margin_used: z.number().finite().positive().optional(),
  bitstamp_market: z.string().regex(/^[a-z0-9-]{1,40}$/).optional()
});

const updateSchema = addSchema.extend({
  originalTicker: z.string().min(1).max(30).transform((v) => v.toUpperCase()),
  originalAssetClass: z.enum(["stock", "crypto", "perp"]).optional(),
  shares: z.number().finite().nonnegative()
});

type AssetClass = "stock" | "crypto" | "perp";
type PositionInput = z.infer<typeof addSchema> | z.infer<typeof updateSchema>;

function assetClassOf(position: { assetClass?: AssetClass }): AssetClass {
  return position.assetClass ?? "stock";
}

function samePositionIdentity(
  position: { ticker: string; assetClass?: AssetClass },
  ticker: string,
  assetClass: AssetClass
) {
  return position.ticker === ticker && assetClassOf(position) === assetClass;
}

function sanitizePositionInput<T extends PositionInput>(position: T): T {
  if (position.assetClass === "crypto") {
    return {
      ...position,
      side: undefined,
      leverage: undefined,
      margin_mode: undefined,
      margin_used: undefined,
      bitstamp_market: undefined
    };
  }

  if (position.assetClass === "perp") {
    return {
      ...position,
      coinGeckoId: undefined,
      staking_provider: undefined,
      staked_amount: undefined,
      staking_apy: undefined,
      currency: "USD"
    };
  }

  return {
    ...position,
    assetClass: position.assetClass ?? "stock",
    coinGeckoId: undefined,
    staking_provider: undefined,
    staked_amount: undefined,
    staking_apy: undefined,
    side: undefined,
    leverage: undefined,
    margin_mode: undefined,
    margin_used: undefined,
    bitstamp_market: undefined
  };
}

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

function stakingInputError(position: PositionInput, maxShares = position.shares): string | null {
  if (position.assetClass !== "crypto") return null;
  if (position.staked_amount != null && position.staked_amount > maxShares) {
    return "Staked amount cannot exceed position quantity";
  }
  if ((position.staked_amount ?? 0) > 0 && position.staking_apy == null) {
    return "Staking APY is required when staking amount is set";
  }
  return null;
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const submitted = sanitizePositionInput(parsed.data);
  const submittedAssetClass = assetClassOf(submitted);

  const positions = await getPositions();
  const existing = positions.find((p) => samePositionIdentity(p, submitted.ticker, submittedAssetClass));
  const stakingError = stakingInputError(submitted, (existing?.shares ?? 0) + submitted.shares);
  if (stakingError) return NextResponse.json({ error: stakingError }, { status: 400 });

  const isPerp = submittedAssetClass === "perp";

  if (existing && isPerp) {
    // Perp: weighted average entry price, additive quantity + margin
    const totalShares = existing.shares + submitted.shares;
    const avgEntry = weightedAverageCost(existing.shares, existing.average_cost, submitted.shares, submitted.average_cost);
    const totalMargin = (existing.margin_used ?? 0) + (submitted.margin_used ?? 0);
    const next = positions.map((position) =>
      samePositionIdentity(position, submitted.ticker, submittedAssetClass)
        ? {
            ...position,
            ...submitted,
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

  const average_cost_usd = isPerp ? submitted.average_cost : await submittedCostUsd(submitted);
  if (existing) {
    const oldCostUsd = await averageCostUsd(existing);
    const newCostUsd = average_cost_usd ?? submitted.average_cost;
    const totalShares = existing.shares + submitted.shares;
    const weightedAverageUsd = weightedAverageCost(existing.shares, oldCostUsd, submitted.shares, newCostUsd);
    const next = positions.map((position) =>
      samePositionIdentity(position, submitted.ticker, submittedAssetClass)
        ? {
            ...position,
            ...submitted,
            company: submitted.company || position.company,
            shares: totalShares,
            average_cost: weightedAverageUsd,
            average_cost_usd: weightedAverageUsd,
            currency: "USD",
            assetClass: submittedAssetClass,
            coinGeckoId: submitted.coinGeckoId ?? position.coinGeckoId,
            staking_provider: submitted.staking_provider ?? position.staking_provider,
            staked_amount: submitted.staked_amount ?? position.staked_amount,
            staking_apy: submitted.staking_apy ?? position.staking_apy,
            sector: submitted.sector || position.sector
          }
        : position
    );
    await setPositions(next);
    return NextResponse.json({ ok: true, merged: true });
  }

  await setPositions([...positions, { ...submitted, assetClass: submittedAssetClass, average_cost_usd }]);
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const submitted = sanitizePositionInput(parsed.data);
  const stakingError = stakingInputError(submitted);
  if (stakingError) return NextResponse.json({ error: stakingError }, { status: 400 });
  const originalAssetClass = parsed.data.originalAssetClass ?? assetClassOf(submitted);
  const submittedAssetClass = assetClassOf(submitted);

  const positions = await getPositions();
  let originalIndex = positions.findIndex((p) =>
    samePositionIdentity(p, parsed.data.originalTicker, originalAssetClass)
  );

  if (originalIndex === -1 && parsed.data.originalAssetClass == null) {
    const tickerMatches = positions
      .map((position, index) => ({ position, index }))
      .filter(({ position }) => position.ticker === parsed.data.originalTicker);

    if (tickerMatches.length === 1) originalIndex = tickerMatches[0].index;
  }

  if (originalIndex === -1) return NextResponse.json({ error: "Position not found" }, { status: 404 });

  const identityTaken = positions.some((position, index) =>
    index !== originalIndex && samePositionIdentity(position, submitted.ticker, submittedAssetClass)
  );
  if (identityTaken) return NextResponse.json({ error: "Position already exists for this asset class" }, { status: 409 });

  const average_cost_usd = submittedAssetClass === "perp" ? submitted.average_cost : await submittedCostUsd(submitted);
  const { originalTicker, originalAssetClass: _originalAssetClass, ...position } = submitted;
  await setPositions(
    positions.map((existing, index) =>
      index === originalIndex ? { ...position, assetClass: submittedAssetClass, average_cost_usd } : existing
    )
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { ticker, assetClass } = await request.json();
  if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

  const positions = await getPositions();
  const normalizedTicker = String(ticker).toUpperCase();
  const normalizedAssetClass = assetClass === "crypto" || assetClass === "perp" || assetClass === "stock"
    ? assetClass
    : undefined;
  const next = positions.filter((position) => {
    if (position.ticker !== normalizedTicker) return true;
    if (!normalizedAssetClass) return false;
    return assetClassOf(position) !== normalizedAssetClass;
  });
  await setPositions(next);
  return NextResponse.json({ ok: true });
}
