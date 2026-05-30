import { getRedis } from "./kv";

// Redis-backed fixed-window limiter for the login endpoint. Counts *failed*
// attempts per IP so a brute-forcer is locked out, while a legitimate user who
// logs in successfully is never penalized. Without Redis (local dev) it fails
// open — rate limiting only matters on the public Vercel deployment.

const WINDOW_SEC = 15 * 60; // 15 minutes
const MAX_FAILURES = 8;

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };

function key(ip: string): string {
  return `login_fail:${ip}`;
}

export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return { allowed: true, remaining: MAX_FAILURES, retryAfterSec: 0 };

  const count = (await redis.get<number>(key(ip))) ?? 0;
  if (count >= MAX_FAILURES) {
    const ttl = await redis.ttl(key(ip));
    return { allowed: false, remaining: 0, retryAfterSec: ttl > 0 ? ttl : WINDOW_SEC };
  }
  return { allowed: true, remaining: MAX_FAILURES - count, retryAfterSec: 0 };
}

export async function registerLoginFailure(ip: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const count = await redis.incr(key(ip));
  if (count === 1) await redis.expire(key(ip), WINDOW_SEC);
}

export async function clearLoginFailures(ip: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(key(ip));
}
