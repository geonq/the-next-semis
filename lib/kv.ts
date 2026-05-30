import fs from "node:fs/promises";
import path from "node:path";
import type { Position, WatchlistEntry } from "./types";
import { loadPositions, loadWatchlist } from "./data";

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
  return new Redis({ url, token });
}

export async function getPositions(): Promise<Position[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<Position[]>("positions");
    if (data) return data;
    const seed = await loadPositions();
    await redis.set("positions", seed);
    return seed;
  }
  return loadPositions();
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<WatchlistEntry[]>("watchlist");
    if (data) return data;
    const seed = await loadWatchlist();
    await redis.set("watchlist", seed);
    return seed;
  }
  return loadWatchlist();
}

export async function setPositions(positions: Position[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set("positions", positions);
    return;
  }
  const dataPath = path.join(process.cwd(), "data", "positions.json");
  await fs.writeFile(dataPath, JSON.stringify(positions, null, 2));
}

export async function setWatchlist(entries: WatchlistEntry[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set("watchlist", entries);
    return;
  }
  const dataPath = path.join(process.cwd(), "data", "watchlist.json");
  await fs.writeFile(dataPath, JSON.stringify(entries, null, 2));
}
