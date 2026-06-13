import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Position, RealizedPnlEntry, ResearchDoc, SavedItem, WatchlistEntry } from "./types";
import { loadPositions, loadRealizedPnl, loadThesis, loadWatchlist, parsePositionEntries, parseWatchlistEntries, realizedPnlSchema } from "./data";

const savedItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["article", "paper"]),
  title: z.string().min(1),
  url: z.string().url(),
  note: z.string().optional(),
  theme: z.string().optional(),
  tickers: z.array(z.string()).default([]),
  addedAt: z.number()
});

function parseSavedItems(data: unknown): SavedItem[] {
  const parsed = z.array(savedItemSchema).safeParse(data);
  return parsed.success ? parsed.data : [];
}

function parseRealizedPnl(data: unknown): RealizedPnlEntry[] {
  const parsed = z.array(realizedPnlSchema).safeParse(data);
  return parsed.success
    ? parsed.data.map((entry): RealizedPnlEntry => ({
        ...entry,
        side: entry.side ?? "long"
      }))
    : [];
}

export function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
  return new Redis({ url, token });
}

export async function getPositions(): Promise<Position[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get("positions");
    if (data) return parsePositionEntries(data);
    const seed = await loadPositions();
    await redis.set("positions", seed);
    return seed;
  }
  return loadPositions();
}

export async function getRealizedPnl(): Promise<RealizedPnlEntry[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get("realized_pnl");
    if (data) return parseRealizedPnl(data);
    const seed = await loadRealizedPnl();
    await redis.set("realized_pnl", seed);
    return seed;
  }
  return loadRealizedPnl();
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get("watchlist");
    if (data) return parseWatchlistEntries(data);
    const seed = await loadWatchlist();
    await redis.set("watchlist", seed);
    return seed;
  }
  return loadWatchlist();
}

export async function getSavedItems(): Promise<SavedItem[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get("saved_items");
    return parseSavedItems(data ?? []);
  }
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "saved_items.json"), "utf8");
    return parseSavedItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function setPositions(positions: Position[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set("positions", positions);
    return;
  }
  await fs.writeFile(path.join(process.cwd(), "data", "positions.json"), JSON.stringify(positions, null, 2));
}

export async function setRealizedPnl(entries: RealizedPnlEntry[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set("realized_pnl", entries);
    return;
  }
  await fs.writeFile(path.join(process.cwd(), "data", "realized_pnl.json"), JSON.stringify(entries, null, 2));
}

export async function setWatchlist(entries: WatchlistEntry[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set("watchlist", entries);
    return;
  }
  await fs.writeFile(path.join(process.cwd(), "data", "watchlist.json"), JSON.stringify(entries, null, 2));
}

export async function setSavedItems(items: SavedItem[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set("saved_items", items);
    return;
  }
  await fs.writeFile(path.join(process.cwd(), "data", "saved_items.json"), JSON.stringify(items, null, 2));
}

export async function getThesis(): Promise<string> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<string>("thesis");
    if (data) return data;
    const seed = await loadThesis();
    await redis.set("thesis", seed);
    return seed;
  }
  return loadThesis();
}

export async function setThesis(markdown: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set("thesis", markdown);
    return;
  }
  await fs.writeFile(path.join(process.cwd(), "data", "thesis.md"), markdown);
}

// `__none__` sentinel lets us cache a "no brand color / monochrome" verdict.
// Without it, null results (e.g. Palantir) miss the cache forever and re-run the
// full external-fetch pipeline on every page load.
export async function getBrandColor(company: string): Promise<string | null | undefined> {
  const redis = getRedis();
  if (!redis) return undefined;
  const fallbackMode = process.env.BRANDFETCH_API_KEY ? "bf1" : "bf0";
  const value = await redis.get<string>(`brandcolor:v17:${fallbackMode}:${company.toLowerCase()}`);
  if (value === null) return undefined; // Redis miss
  return value === "__none__" ? null : value;
}

const researchDocSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["md", "pdf"]),
  size: z.number(),
  blobUrl: z.string().default(""),
  addedAt: z.number()
});

function parseResearchDocs(data: unknown): ResearchDoc[] {
  const parsed = z.array(researchDocSchema).safeParse(data);
  return parsed.success ? parsed.data : [];
}

export async function getResearchDocs(): Promise<ResearchDoc[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get("research_docs");
    return parseResearchDocs(data ?? []);
  }
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "research_docs.json"), "utf8");
    return parseResearchDocs(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function setResearchDocs(docs: ResearchDoc[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set("research_docs", docs);
    return;
  }
  await fs.writeFile(path.join(process.cwd(), "data", "research_docs.json"), JSON.stringify(docs, null, 2));
}

export async function setBrandColor(company: string, color: string | null): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const fallbackMode = process.env.BRANDFETCH_API_KEY ? "bf1" : "bf0";
  await redis.set(`brandcolor:v17:${fallbackMode}:${company.toLowerCase()}`, color ?? "__none__");
}
