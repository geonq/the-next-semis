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

  it("persists staking settings for crypto spot positions only", async () => {
    const cryptoResponse = await POST(jsonRequest({
      ticker: "SOL",
      company: "Solana",
      assetClass: "crypto",
      shares: 10,
      average_cost: 140,
      currency: "USD",
      sector: "Crypto",
      coinGeckoId: "solana",
      staking_provider: "Robinhood",
      staked_amount: 9,
      staking_apy: 4.5
    }));

    expect(cryptoResponse.status).toBe(200);
    expect(positions[0]).toMatchObject({
      ticker: "SOL",
      assetClass: "crypto",
      staking_provider: "Robinhood",
      staked_amount: 9,
      staking_apy: 4.5
    });

    const perpResponse = await POST(jsonRequest({
      ticker: "SOL",
      company: "Solana Perp",
      assetClass: "perp",
      shares: 1,
      average_cost: 150,
      currency: "USD",
      sector: "Crypto",
      side: "long",
      staking_provider: "Robinhood",
      staked_amount: 1,
      staking_apy: 4.5,
      bitstamp_market: "solusd-perp"
    }));

    expect(perpResponse.status).toBe(200);
    const perp = positions.find((p) => p.assetClass === "perp");
    expect(perp).toMatchObject({ ticker: "SOL", assetClass: "perp" });
    expect(perp?.staking_provider).toBeUndefined();
    expect(perp?.staked_amount).toBeUndefined();
    expect(perp?.staking_apy).toBeUndefined();
  });

  it("rejects staking more crypto than the held spot quantity", async () => {
    const response = await POST(jsonRequest({
      ticker: "SOL",
      company: "Solana",
      assetClass: "crypto",
      shares: 5,
      average_cost: 140,
      currency: "USD",
      sector: "Crypto",
      coinGeckoId: "solana",
      staking_provider: "Robinhood",
      staked_amount: 6,
      staking_apy: 4.5
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Staked amount cannot exceed position quantity" });
    expect(positions).toHaveLength(0);
  });
});
