import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RealizedPnlEntry } from "@/lib/types";

let entries: RealizedPnlEntry[] = [];

vi.mock("@/lib/kv", () => ({
  getRealizedPnl: vi.fn(async () => entries),
  setRealizedPnl: vi.fn(async (next: RealizedPnlEntry[]) => {
    entries = next;
  })
}));

import { POST, PUT } from "@/app/api/realized-pnl/route";

function jsonRequest(body: unknown): Request {
  return new Request("https://app.test/api/realized-pnl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("realized PnL API", () => {
  beforeEach(() => {
    entries = [];
  });

  it("strips perp-only fields from crypto realized PnL entries", async () => {
    const response = await POST(jsonRequest({
      ticker: "SOL",
      company: "Solana",
      assetClass: "crypto",
      side: "long",
      quantity: 2,
      entry_price: 100,
      exit_price: 150,
      leverage: 5,
      margin_mode: "isolated",
      margin_used: 40,
      bitstamp_market: "solusd-perp",
      currency: "USD",
      closed_at: "2026-06-15"
    }));

    expect(response.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      ticker: "SOL",
      assetClass: "crypto",
      quantity: 2
    });
    expect(entries[0].leverage).toBeUndefined();
    expect(entries[0].margin_mode).toBeUndefined();
    expect(entries[0].margin_used).toBeUndefined();
    expect(entries[0].bitstamp_market).toBeUndefined();
  });

  it("strips stale perp fields when updating a realized PnL entry to crypto", async () => {
    entries = [
      {
        id: "trade-1",
        ticker: "SOL",
        company: "Solana Perp",
        assetClass: "perp",
        side: "long",
        quantity: 1,
        entry_price: 100,
        exit_price: 120,
        leverage: 5,
        margin_mode: "isolated",
        margin_used: 20,
        bitstamp_market: "solusd-perp",
        currency: "USD",
        closed_at: "2026-06-15"
      }
    ];

    const response = await PUT(jsonRequest({
      id: "trade-1",
      ticker: "SOL",
      company: "Solana",
      assetClass: "crypto",
      side: "long",
      quantity: 1,
      entry_price: 100,
      exit_price: 120,
      leverage: 5,
      margin_mode: "isolated",
      margin_used: 20,
      bitstamp_market: "solusd-perp",
      currency: "USD",
      closed_at: "2026-06-15"
    }));

    expect(response.status).toBe(200);
    expect(entries[0]).toMatchObject({
      id: "trade-1",
      ticker: "SOL",
      company: "Solana",
      assetClass: "crypto"
    });
    expect(entries[0].leverage).toBeUndefined();
    expect(entries[0].margin_mode).toBeUndefined();
    expect(entries[0].margin_used).toBeUndefined();
    expect(entries[0].bitstamp_market).toBeUndefined();
  });
});
