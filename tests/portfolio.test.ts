import { describe, expect, it } from "vitest";
import { enrichPositions, movers, portfolioSummary } from "@/lib/portfolio";
import type { Position, QuotesByTicker } from "@/lib/types";

const positions: Position[] = [
  { ticker: "NVDA", company: "NVIDIA", shares: 10, average_cost: 100, currency: "USD", sector: "Semis" },
  { ticker: "AMD", company: "AMD", shares: 5, average_cost: 80, currency: "USD", sector: "Semis" },
  { ticker: "MISS", company: "Missing", shares: 1, average_cost: 1, currency: "USD", sector: "Test" }
];

const quotes: QuotesByTicker = {
  NVDA: {
    ticker: "NVDA",
    price: 135,
    currency: "USD",
    regular_market_change: 2.5,
    regular_market_change_percent: 1.89,
    timestamp: 1
  },
  AMD: {
    ticker: "AMD",
    price: 60,
    currency: "USD",
    regular_market_change: -1,
    regular_market_change_percent: -1.2,
    timestamp: 1
  }
};

describe("portfolio calculations", () => {
  it("enriches positions with value, PnL, and no-data state", () => {
    const [nvda, amd, missing] = enrichPositions(positions, quotes);

    expect(nvda.total_value).toBe(1350);
    expect(nvda.pnl_dollars).toBe(350);
    expect(nvda.pnl_percent).toBe(35);
    expect(amd.pnl_dollars).toBe(-100);
    expect(missing.quote_status).toBe("no_data");
  });

  it("summarizes only positions with quote data", () => {
    const summary = portfolioSummary(enrichPositions(positions, quotes));

    expect(summary.total_value).toBe(1650);
    expect(summary.day_change_dollars).toBe(20);
    expect(summary.day_change_percent).toBeCloseTo(1.227, 3);
  });

  it("orders movers by day-change direction and excludes missing data", () => {
    const enriched = enrichPositions(positions, quotes);

    expect(movers(enriched, "desc").map((position) => position.ticker)).toEqual(["NVDA", "AMD"]);
    expect(movers(enriched, "asc").map((position) => position.ticker)).toEqual(["AMD", "NVDA"]);
  });
});
