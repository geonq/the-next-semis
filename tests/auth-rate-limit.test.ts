import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { signSession, verifySession } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth sessions", () => {
  it("round-trips valid JWT sessions and rejects garbage", async () => {
    vi.stubEnv("JWT_SECRET", "unit-test-secret");

    const token = await signSession();

    await expect(verifySession(token)).resolves.toBe(true);
    await expect(verifySession("not-a-token")).resolves.toBe(false);
  });

  it("rejects signed JWTs that do not carry the admin role", async () => {
    vi.stubEnv("JWT_SECRET", "unit-test-secret");
    const token = await new SignJWT({ role: "viewer" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode("unit-test-secret"));

    await expect(verifySession(token)).resolves.toBe(false);
  });

  it("fails closed without JWT_SECRET outside local development", async () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(signSession()).rejects.toThrow("JWT_SECRET is required outside local development");
  });
});

describe("login rate limiting", () => {
  it("fails open only in local development without Redis", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    await expect(checkLoginRateLimit("127.0.0.1")).resolves.toMatchObject({ allowed: true });
  });

  it("fails closed in production without Redis", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    await expect(checkLoginRateLimit("127.0.0.1")).rejects.toThrow("Upstash Redis is required");
  });
});
