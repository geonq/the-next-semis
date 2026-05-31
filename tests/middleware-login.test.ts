import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { signSession } from "@/lib/auth";
import { middleware } from "@/middleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("write middleware", () => {
  it("blocks write requests without a valid session", async () => {
    const response = await middleware(new NextRequest("https://app.test/api/watchlist", { method: "POST" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("allows write requests with a valid session and all read requests", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JWT_SECRET", "unit-test-secret");
    const token = await signSession();

    const writeResponse = await middleware(
      new NextRequest("https://app.test/api/watchlist", {
        method: "POST",
        headers: { cookie: `session=${token}` }
      })
    );
    const readResponse = await middleware(new NextRequest("https://app.test/api/watchlist", { method: "GET" }));

    expect(writeResponse.status).toBe(200);
    expect(readResponse.status).toBe(200);
  });
});

describe("login route", () => {
  it("rejects wrong credentials", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "secret");

    const response = await login(
      new Request("https://app.test/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "admin", password: "wrong" })
      })
    );

    expect(response.status).toBe(401);
  });

  it("sets an httpOnly session cookie for correct credentials", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JWT_SECRET", "unit-test-secret");
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "secret");

    const response = await login(
      new Request("https://app.test/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "admin", password: "secret" })
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
});
