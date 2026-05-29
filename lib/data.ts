import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Position, WatchlistEntry } from "./types";

const positionSchema = z.object({
  ticker: z.string().min(1).transform((value) => value.toUpperCase()),
  company: z.string().min(1),
  shares: z.number(),
  average_cost: z.number(),
  currency: z.string().min(1),
  sector: z.string().min(1),
  thesis_id: z.string().optional()
});

const watchlistSchema = z.object({
  ticker: z.string().min(1).transform((value) => value.toUpperCase()),
  company: z.string().min(1),
  theme: z.string().min(1),
  conditions: z.array(z.string()),
  conviction: z.string().min(1),
  status: z.string().min(1)
});

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
  return readJsonArray("watchlist.json", watchlistSchema);
}

export async function loadThesis(): Promise<string> {
  return fs.readFile(path.join(dataDir, "thesis.md"), "utf8");
}

export function trackedTickers(positions: Position[], watchlist: WatchlistEntry[]): string[] {
  return Array.from(new Set([...positions, ...watchlist].map((entry) => entry.ticker))).sort();
}
