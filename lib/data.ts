import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Position, WatchlistEntry } from "./types";

const positionSchema = z.object({
  ticker: z.string().min(1).transform((value) => value.toUpperCase()),
  company: z.string().min(1),
  assetClass: z.enum(["stock", "crypto"]).optional(),
  shares: z.number(),
  average_cost: z.number(),
  average_cost_usd: z.number().optional(),
  entry_date: z.string().optional(),
  currency: z.string().min(1),
  sector: z.string().min(1),
  thesis_id: z.string().optional(),
  coinGeckoId: z.string().optional()
});

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

async function readJsonArray<T>(fileName: string, schema: z.ZodType<T>): Promise<T[]> {
  const raw = await fs.readFile(path.join(dataDir, fileName), "utf8");
  const parsed = JSON.parse(raw);
  return z.array(schema).parse(parsed);
}

export async function loadPositions(): Promise<Position[]> {
  return readJsonArray("positions.json", positionSchema);
}

export async function loadWatchlist(): Promise<WatchlistEntry[]> {
  const raw = await fs.readFile(path.join(dataDir, "watchlist.json"), "utf8");
  return parseWatchlistEntries(JSON.parse(raw));
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

export async function loadThesis(): Promise<string> {
  return fs.readFile(path.join(dataDir, "thesis.md"), "utf8");
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
