import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { CashEntry, Position, RealizedPnlEntry, SavedItem, WatchlistEntry } from "./types";
import initialPositions from "../data/positions.json";
import initialRealizedPnl from "../data/realized_pnl.json";
import initialCash from "../data/cash.json";
import initialWatchlist from "../data/watchlist.json";
import initialSavedItems from "../data/saved_items.json";

export const positionSchema = z.object({
  ticker: z.string().min(1).transform((value) => value.toUpperCase()),
  company: z.string().min(1),
  assetClass: z.enum(["stock", "crypto", "perp"]).optional(),
  shares: z.number(),
  average_cost: z.number(),
  average_cost_usd: z.number().optional(),
  entry_date: z.string().optional(),
  currency: z.string().min(1),
  sector: z.string().min(1),
  thesis_id: z.string().optional(),
  coinGeckoId: z.string().optional(),
  staking_provider: z.string().max(80).optional(),
  staked_amount: z.number().finite().nonnegative().optional(),
  staking_apy: z.number().finite().nonnegative().optional(),
  side: z.enum(["long", "short"]).optional(),
  leverage: z.number().finite().positive().optional(),
  margin_mode: z.enum(["isolated", "shared"]).optional(),
  margin_used: z.number().finite().positive().optional(),
  bitstamp_market: z.string().regex(/^[a-z0-9-]{1,40}$/).optional()
});

export const realizedPnlSchema = z.object({
  id: z.string().min(1),
  ticker: z.string().min(1).max(30).transform((value) => value.toUpperCase()),
  company: z.string().min(1).max(200),
  assetClass: z.enum(["stock", "crypto", "perp"]).optional(),
  side: z.enum(["long", "short"]).default("long"),
  quantity: z.number().finite().positive(),
  entry_price: z.number().finite().nonnegative(),
  exit_price: z.number().finite().nonnegative(),
  fees: z.number().finite().nonnegative().optional(),
  leverage: z.number().finite().positive().optional(),
  margin_mode: z.enum(["isolated", "shared"]).optional(),
  margin_used: z.number().finite().positive().optional(),
  bitstamp_market: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  currency: z.string().min(1).max(10),
  opened_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  closed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sector: z.string().max(100).optional(),
  note: z.string().max(1000).optional()
});

export const cashEntryBaseSchema = z.object({
  id: z.string().min(1),
  amount: z.number().finite(),
  amount_usd: z.number().finite().optional(),
  currency: z.enum(["USD", "EUR", "GBP", "JPY"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional()
});

export const cashEntrySchema = cashEntryBaseSchema;

export const watchlistSchema = z.object({
  ticker: z.string().min(1).transform((value) => value.toUpperCase()),
  company: z.string().min(1),
  assetType: z.enum(["equity", "etf", "crypto"]).default("equity"),
  theme: z.string().min(1),
  conditions: z.array(z.string()),
  conviction: z.string().min(1),
  status: z.string().min(1),
  brandColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().default(null),
  buyTrigger: z.string().max(500).optional(),
  coinGeckoId: z.string().max(100).optional()
}).transform((entry) => ({
  ...entry,
  assetType: entry.assetType ?? "equity",
  brandColor: entry.brandColor ?? null
}));

const dataDir = path.join(process.cwd(), "data");

const staticData: Record<string, unknown> = {
  "positions.json": initialPositions,
  "realized_pnl.json": initialRealizedPnl,
  "cash.json": initialCash,
  "watchlist.json": initialWatchlist,
  "saved_items.json": initialSavedItems
};

async function readJsonArray<T>(fileName: string, schema: z.ZodType<T>): Promise<T[]> {
  try {
    const raw = await fs.readFile(path.join(dataDir, fileName), "utf8");
    const parsed = JSON.parse(raw);
    return z.array(schema).parse(parsed);
  } catch {
    const fallback = staticData[fileName];
    if (fallback) return z.array(schema).parse(fallback);
    return [];
  }
}

export async function loadPositions(): Promise<Position[]> {
  return readJsonArray("positions.json", positionSchema);
}

export function parsePositionEntries(data: unknown): Position[] {
  const parsed = z.array(positionSchema).safeParse(data);
  return parsed.success ? parsed.data : [];
}

export async function loadRealizedPnl(): Promise<RealizedPnlEntry[]> {
  const entries = await readJsonArray("realized_pnl.json", realizedPnlSchema);
  return entries.map((entry): RealizedPnlEntry => ({
    ...entry,
    side: entry.side ?? "long"
  }));
}

export async function loadCashEntries(): Promise<CashEntry[]> {
  try {
    return readJsonArray("cash.json", cashEntrySchema);
  } catch {
    return [];
  }
}

export function parseCashEntries(data: unknown): CashEntry[] {
  const parsed = z.array(cashEntrySchema).safeParse(data);
  return parsed.success ? parsed.data : [];
}

export async function loadWatchlist(): Promise<WatchlistEntry[]> {
  try {
    const raw = await fs.readFile(path.join(dataDir, "watchlist.json"), "utf8");
    return parseWatchlistEntries(JSON.parse(raw));
  } catch {
    return parseWatchlistEntries(initialWatchlist);
  }
}

export function parseWatchlistEntries(data: unknown): WatchlistEntry[] {
  const parsed = z.array(watchlistSchema).safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.map((entry) => ({
    ...entry,
    assetType: entry.assetType ?? "equity",
    brandColor: entry.brandColor ?? null
  }));
}

export const savedItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["article", "paper"]),
  title: z.string().min(1),
  url: z.string().url(),
  note: z.string().optional(),
  theme: z.string().optional(),
  tickers: z.array(z.string()).default([]),
  addedAt: z.number()
});

export async function loadSavedItems(): Promise<SavedItem[]> {
  const items = await readJsonArray("saved_items.json", savedItemSchema);
  return items.map((item) => ({
    ...item,
    tickers: item.tickers ?? []
  }));
}

const thesisSeed = `# The Next Semis — Investment Thesis

Semiconductors were the defining infrastructure bet of the AI wave: whoever controlled compute controlled the bottleneck.
That trade is maturing. The question now is: **what is the next layer of physical infrastructure that AI and the broader digital economy will hit at scale?**

## The Pattern

Every technology supercycle runs through a constraint. In the 1990s it was networking equipment (Cisco). In the 2000s it was storage and servers. In the 2010s it was cloud hyperscalers. In the 2020s, chips.

The next constraint will be something that today looks *adjacent and boring* — the way ASML looked adjacent and boring before EUV became the only path to advanced nodes.

## Candidates Under Surveillance

**Semiconductor equipment** — EUV and High-NA EUV are decade-long moats. ASML is not the trade; it is the template. Who is ASML for the next generation of fab constraints?

**Power infrastructure** — AI datacenters are approaching 1 GW per campus. The grid, transformers, and cooling systems are the new bottleneck. This is not a software problem.

**Photonics and optical interconnects** — As GPU clusters scale beyond a single rack, copper hits latency and power limits. Silicon photonics is 5–10 years from being the default interconnect inside datacenters.

**Advanced packaging** — CoWoS and HBM are already constrained. The companies that own advanced packaging capacity — TSMC, ASE, Amkor — are infrastructure, not just contract manufacturers.

## Investment Criteria

A position graduates from watchlist to portfolio when:

1. The physical constraint is independently verifiable (capacity data, lead times, capex announcements)
2. The moat is structural, not cyclical — pricing power that survives a down-cycle
3. Management has demonstrated capital discipline in at least one prior capex cycle
4. Entry price implies a reasonable margin of safety on through-cycle earnings
`;

export async function loadThesis(): Promise<string> {
  try {
    return await fs.readFile(path.join(dataDir, "thesis.md"), "utf8");
  } catch {
    return thesisSeed;
  }
}

export function trackedTickers(positions: Position[], watchlist: WatchlistEntry[]): string[] {
  return Array.from(
    new Set(
      [...positions, ...watchlist]
        .filter((entry) => !entry.coinGeckoId)
        .map((entry) => entry.ticker)
    )
  ).sort();
}

export function trackedCryptoIds(
  positions: Position[],
  watchlist: WatchlistEntry[]
): Array<{ id: string; symbol: string }> {
  const seen = new Set<string>();
  const result: Array<{ id: string; symbol: string }> = [];
  for (const entry of [...positions, ...watchlist]) {
    if (entry.coinGeckoId && !seen.has(entry.coinGeckoId)) {
      seen.add(entry.coinGeckoId);
      result.push({ id: entry.coinGeckoId, symbol: entry.ticker });
    }
  }
  return result;
}

export function formatCoingeckoParam(
  cryptoIds: Array<{ id: string; symbol: string }>
): string {
  return cryptoIds.map(({ id, symbol }) => `${id}:${symbol}`).join(",");
}
