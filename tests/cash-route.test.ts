import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CashEntry } from "@/lib/types";

let entries: CashEntry[] = [];

vi.mock("@/lib/kv", () => ({
  getCashEntries: vi.fn(async () => entries),
  setCashEntries: vi.fn(async (next: CashEntry[]) => {
    entries = next;
  })
}));

import { POST } from "@/app/api/cash/route";

describe("cash API", () => {
  beforeEach(() => {
    entries = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores USD cash flows without external FX", async () => {
    const response = await POST(new Request("https://app.test/api/cash", {
      method: "POST",
      body: JSON.stringify({ amount: 100, currency: "USD", date: "2026-01-01" })
    }));

    expect(response.status).toBe(200);
    expect(entries).toMatchObject([{ amount: 100, amount_usd: 100, currency: "USD", date: "2026-01-01" }]);
  });

  it("stores dated USD conversion for non-USD cash flows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rates: { USD: 1.1 } })));

    const response = await POST(new Request("https://app.test/api/cash", {
      method: "POST",
      body: JSON.stringify({ amount: 100, currency: "EUR", date: "2026-01-01" })
    }));

    expect(response.status).toBe(200);
    expect(entries[0]).toMatchObject({ amount: 100, currency: "EUR", date: "2026-01-01" });
    expect(entries[0].amount_usd).toBeCloseTo(110, 6);
  });
});
