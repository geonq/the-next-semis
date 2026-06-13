import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { signSession } from "@/lib/auth";
import { checkLoginRateLimit, clearLoginFailures, registerLoginFailure } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Constant-time string compare so login can't be probed character-by-character
// via response timing. Length mismatch returns early (length is not secret here).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

const loginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500)
}).strict();

export async function POST(request: Request) {
  const ip = clientIp(request);

  const limit = await checkLoginRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { username, password } = parsed.data;
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;

  const ok =
    typeof username === "string" &&
    typeof password === "string" &&
    Boolean(expectedUser) &&
    Boolean(expectedPass) &&
    safeEqual(username, expectedUser!) &&
    safeEqual(password, expectedPass!);

  if (!ok) {
    await registerLoginFailure(ip);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await clearLoginFailures(ip);

  const token = await signSession();
  const response = NextResponse.json({ ok: true });

  response.cookies.set("session", token, {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7
  });

  response.cookies.set("is_admin", "1", {
    httpOnly: false,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7
  });

  return response;
}
