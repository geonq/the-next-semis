import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Position } from "@/lib/types";

let positions: Position[] = [];

vi.mock("@/lib/kv", () => ({
  getPositions: vi.fn(async () => positions),
  setPositions: vi.fn(async (next: Position[]) => {
    positions = next;
  })
}));

import { DELETE, POST, PUT } from "@/app/api/positions/route";

function jsonRequest(body: unknown): Request {
  return new Request("https://app.test/api/positions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("positions API", () => {
  beforeEach(() => {
    positions = [];
  });

  it("keeps spot crypto and perps separate when tickers match", async () => {
    positions = [
      {
        ticker: "SOL",
        company: "Solana Perp",
        assetClass: "perp",
        shares: 1,
        average_cost: 150,
        average_cost_usd: 150,
        currency: "USD",
        sector: "Crypto",
        side: "long",
        leverage: 5,
        margin_mode: "isolated",
        margin_used: 30,
        bitstamp_market: "solusd-perp"
      }
    ];

    const response = await POST(jsonRequest({
      ticker: "SOL",
      company: "Solana",
      assetClass: "crypto",
      shares: 2,
      average_cost: 140,
      currency: "USD",
      sector: "Crypto",
      coinGeckoId: "solana"
    }));

    expect(response.status).toBe(200);
    expect(positions).toHaveLength(2);
    expect(positions.find((p) => p.assetClass === "perp")).toMatchObject({
      ticker: "SOL",
      shares: 1,
      margin_used: 30,
      bitstamp_market: "solusd-perp"
    });
    expect(positions.find((p) => p.assetClass === "crypto")).toMatchObject({
      ticker: "SOL",
      company: "Solana",
      shares: 2,
      average_cost: 140,
      coinGeckoId: "solana"
    });
  });

  it("merges only the matching asset class for duplicate tickers", async () => {
    positions = [
      {
        ticker: "SOL",
        company: "Solana",
        assetClass: "crypto",
        shares: 2,
        average_cost: 100,
        average_cost_usd: 100,
        currency: "USD",
        sector: "Crypto",
        coinGeckoId: "solana"
      },
      {
        ticker: "SOL",
        company: "Solana Perp",
        assetClass: "perp",
        shares: 1,
        average_cost: 150,
        average_cost_usd: 150,
        currency: "USD",
        sector: "Crypto",
        side: "long",
        margin_used: 30,
        bitstamp_market: "solusd-perp"
      }
    ];

    const response = await POST(jsonRequest({
      ticker: "SOL",
      company: "Solana",
      assetClass: "crypto",
      shares: 1,
      average_cost: 160,
      currency: "USD",
      sector: "Crypto",
      coinGeckoId: "solana"
    }));

    expect(response.status).toBe(200);
    expect(positions).toHaveLength(2);
    expect(positions.find((p) => p.assetClass === "crypto")).toMatchObject({
      shares: 3,
      average_cost: 120,
      average_cost_usd: 120
    });
    expect(positions.find((p) => p.assetClass === "perp")).toMatchObject({
      shares: 1,
      average_cost: 150,
      margin_used: 30
    });
  });

  it("edits and deletes duplicate tickers by asset class", async () => {
    positions = [
      {
        ticker: "SOL",
        company: "Solana",
        assetClass: "crypto",
        shares: 2,
        average_cost: 100,
        average_cost_usd: 100,
        currency: "USD",
        sector: "Crypto",
        coinGeckoId: "solana"
      },
      {
        ticker: "SOL",
        company: "Solana Perp",
        assetClass: "perp",
        shares: 1,
        average_cost: 150,
        average_cost_usd: 150,
        currency: "USD",
        sector: "Crypto",
        side: "long",
        margin_used: 30,
        bitstamp_market: "solusd-perp"
      }
    ];

    const updateResponse = await PUT(jsonRequest({
      originalTicker: "SOL",
      originalAssetClass: "crypto",
      ticker: "SOL",
      company: "Solana spot",
      assetClass: "crypto",
      shares: 3,
      average_cost: 110,
      currency: "USD",
      sector: "Crypto",
      coinGeckoId: "solana"
    }));

    expect(updateResponse.status).toBe(200);
    expect(positions.find((p) => p.assetClass === "crypto")).toMatchObject({
      company: "Solana spot",
      shares: 3
    });
    expect(positions.find((p) => p.assetClass === "perp")).toMatchObject({
      company: "Solana Perp",
      shares: 1
    });

    const deleteResponse = await DELETE(jsonRequest({ ticker: "SOL", assetClass: "crypto" }));

    expect(deleteResponse.status).toBe(200);
    expect(positions).toEqual([
      expect.objectContaining({
        ticker: "SOL",
        assetClass: "perp",
        company: "Solana Perp"
      })
    ]);
  });
});
