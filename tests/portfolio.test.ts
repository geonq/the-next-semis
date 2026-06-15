import { describe, expect, it } from "vitest";
import {
  accountSummary,
  buildPortfolioChartSeries,
  cashFlowsTotal,
  enrichPositions,
  enrichRealizedPnl,
  estimatedCashBalance,
  historySourceForPortfolioRange,
  movers,
  portfolioSummary,
  realizedPnlLeaders,
  realizedPnlSummary,
  weightedAverageCost
} from "@/lib/portfolio";
import type { CashEntry, Position, QuotesByTicker, RealizedPnlEntry } from "@/lib/types";

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

const realizedPnl: RealizedPnlEntry[] = [
  {
    id: "win-1",
    ticker: "NVDA",
    company: "NVIDIA",
    side: "long",
    quantity: 10,
    entry_price: 100,
    exit_price: 130,
    fees: 5,
    currency: "USD",
    closed_at: "2026-01-10"
  },
  {
    id: "loss-1",
    ticker: "AMD",
    company: "AMD",
    side: "long",
    quantity: 5,
    entry_price: 80,
    exit_price: 70,
    currency: "USD",
    closed_at: "2026-01-11"
  },
  {
    id: "short-win",
    ticker: "BTC-PERP",
    company: "Bitcoin Perp",
    assetClass: "perp",
    side: "short",
    quantity: 0.5,
    entry_price: 100000,
    exit_price: 90000,
    fees: 10,
    leverage: 10,
    margin_mode: "isolated",
    currency: "USD",
    closed_at: "2026-01-12"
  }
];

const cashEntries: CashEntry[] = [
  { id: "deposit-usd", amount: 1000, amount_usd: 1000, currency: "USD", date: "2026-01-01" },
  { id: "deposit-eur", amount: 100, amount_usd: 110, currency: "EUR", date: "2026-01-05" }
];

describe("portfolio calculations", () => {
  it("enriches positions with value, PnL, and no-data state", () => {
    const [nvda, amd, missing] = enrichPositions(positions, quotes);

    expect(nvda.total_value).toBe(1350);
    expect(nvda.pnl_dollars).toBe(350);
    expect(nvda.pnl_percent).toBe(35);
    expect(amd.pnl_dollars).toBe(-100);
    expect(missing.quote_status).toBe("no_data");
  });

  it("uses USD average cost when present", () => {
    const [position] = enrichPositions(
      [{ ticker: "HYPE", company: "Hyperliquid", assetClass: "crypto", shares: 6, average_cost: 7, average_cost_usd: 7.5, currency: "USD", sector: "Crypto", coinGeckoId: "hyperliquid" }],
      {
        HYPE: {
          ticker: "HYPE",
          price: 10,
          currency: "USD",
          regular_market_change: 1,
          regular_market_change_percent: 11.11,
          timestamp: 1
        }
      }
    );

    expect(position.pnl_dollars).toBe(15);
    expect(position.pnl_percent).toBeCloseTo(33.333, 3);
  });

  it("calculates weighted average cost when adding to a position", () => {
    expect(weightedAverageCost(3, 5, 3, 10)).toBe(7.5);
    expect(weightedAverageCost(3, 5, 3, 5)).toBe(5);
  });

  it("summarizes only positions with quote data", () => {
    const summary = portfolioSummary(enrichPositions(positions, quotes));

    expect(summary.total_value).toBe(1650);
    expect(summary.day_change_dollars).toBe(20);
    expect(summary.day_change_percent).toBeCloseTo(1.227, 3);
  });

  it("filters movers by positive and negative day-change direction", () => {
    const enriched = enrichPositions(positions, quotes);

    expect(movers(enriched, "desc").map((position) => position.ticker)).toEqual(["NVDA"]);
    expect(movers(enriched, "asc").map((position) => position.ticker)).toEqual(["AMD"]);
  });

  it("returns no losers when every quoted position is flat or positive", () => {
    const positiveQuotes: QuotesByTicker = {
      ...quotes,
      AMD: { ...quotes.AMD, regular_market_change: 0, regular_market_change_percent: 0 }
    };
    const enriched = enrichPositions(positions, positiveQuotes);

    expect(movers(enriched, "asc")).toEqual([]);
  });

  it("enriches realized PnL entries for long and short trades", () => {
    const [longWin, longLoss, shortWin] = enrichRealizedPnl(realizedPnl);

    expect(longWin.realized_pnl).toBe(295);
    expect(longWin.realized_pnl_percent).toBe(29.5);
    expect(longLoss.realized_pnl).toBe(-50);
    expect(shortWin.realized_pnl).toBe(4990);
    expect(shortWin.return_basis).toBe(5000);
    expect(shortWin.realized_pnl_percent).toBeCloseTo(99.8, 2);
  });

  it("summarizes realized PnL and ranks all-time winners and losers", () => {
    const enriched = enrichRealizedPnl(realizedPnl);
    const summary = realizedPnlSummary(enriched);

    expect(summary.total_realized_pnl).toBe(5235);
    expect(summary.winners).toBe(2);
    expect(summary.losers).toBe(1);
    expect(summary.win_rate).toBeCloseTo(66.667, 3);
    expect(summary.average_winner).toBe(2642.5);
    expect(summary.average_loser).toBe(-50);
    expect(realizedPnlLeaders(enriched, "winners").map((entry) => entry.id)).toEqual(["short-win", "win-1"]);
    expect(realizedPnlLeaders(enriched, "losers").map((entry) => entry.id)).toEqual(["loss-1"]);
  });

  it("summarizes account value from cash flows plus active and realized PnL", () => {
    const enriched = enrichPositions(positions, quotes);
    const realized = enrichRealizedPnl(realizedPnl);
    const summary = accountSummary(enriched, realized, cashEntries);

    expect(cashFlowsTotal(cashEntries)).toBe(1110);
    expect(summary.total_value).toBe(6595);
    expect(summary.day_change_dollars).toBe(20);
    expect(estimatedCashBalance(cashEntries, positions, realized)).toBe(4944);
  });

  it("maps portfolio chart ranges to bounded history sources", () => {
    expect(historySourceForPortfolioRange("live")).toBe("1d");
    expect(historySourceForPortfolioRange("1d")).toBe("1d");
    expect(historySourceForPortfolioRange("1w")).toBe("5d");
    expect(historySourceForPortfolioRange("1month")).toBe("1mo");
    expect(historySourceForPortfolioRange("ytd")).toBe("1y");
    expect(historySourceForPortfolioRange("all")).toBe("max");
  });

  it("builds a portfolio chart from active holdings plus cumulative realized PnL", () => {
    const chartPositions: Position[] = [
      { ticker: "NVDA", company: "NVIDIA", shares: 2, average_cost: 100, entry_date: "2026-01-02", currency: "USD", sector: "Semis" },
      { ticker: "AMD", company: "AMD", shares: 1, average_cost: 80, entry_date: "2026-01-04", currency: "USD", sector: "Semis" }
    ];
    const series = buildPortfolioChartSeries({
      positions: chartPositions,
      realizedPnl,
      now: Date.UTC(2026, 0, 12, 12) / 1000,
      histories: {
        max: {
          NVDA: [
            { time: Date.UTC(2026, 0, 1) / 1000, open: 100, high: 100, low: 100, close: 100 },
            { time: Date.UTC(2026, 0, 10) / 1000, open: 130, high: 130, low: 130, close: 130 },
            { time: Date.UTC(2026, 0, 12) / 1000, open: 140, high: 140, low: 140, close: 140 }
          ],
          AMD: [
            { time: Date.UTC(2026, 0, 3) / 1000, open: 80, high: 80, low: 80, close: 80 },
            { time: Date.UTC(2026, 0, 11) / 1000, open: 70, high: 70, low: 70, close: 70 },
            { time: Date.UTC(2026, 0, 12) / 1000, open: 75, high: 75, low: 75, close: 75 }
          ]
        }
      }
    });

    expect(series.all.at(-1)).toMatchObject({
      value: 5590,
      active_value: 355,
      realized_pnl: 5235
    });
  });

  it("builds a cash-aware account chart from deposits plus PnL instead of double-counting cost basis", () => {
    const chartPositions: Position[] = [
      { ticker: "NVDA", company: "NVIDIA", shares: 2, average_cost: 100, entry_date: "2026-01-02", currency: "USD", sector: "Semis" }
    ];
    const series = buildPortfolioChartSeries({
      positions: chartPositions,
      realizedPnl: [],
      cashEntries,
      now: Date.UTC(2026, 0, 12, 12) / 1000,
      histories: {
        max: {
          NVDA: [
            { time: Date.UTC(2026, 0, 2) / 1000, open: 100, high: 100, low: 100, close: 100 },
            { time: Date.UTC(2026, 0, 12) / 1000, open: 140, high: 140, low: 140, close: 140 }
          ]
        }
      }
    });

    expect(series.all.at(-1)).toMatchObject({
      value: 1190,
      active_value: 280,
      realized_pnl: 0
    });
    expect(series.all.some((point) => point.time === Date.UTC(2026, 0, 5) / 1000 && point.value === 1110)).toBe(true);
  });

  it("does not count active holdings before their entry date", () => {
    const series = buildPortfolioChartSeries({
      positions: [
        { ticker: "NVDA", company: "NVIDIA", shares: 2, average_cost: 100, entry_date: "2026-01-10", currency: "USD", sector: "Semis" }
      ],
      realizedPnl: [],
      now: Date.UTC(2026, 0, 12, 12) / 1000,
      histories: {
        max: {
          NVDA: [
            { time: Date.UTC(2026, 0, 9) / 1000, open: 100, high: 100, low: 100, close: 100 },
            { time: Date.UTC(2026, 0, 10) / 1000, open: 120, high: 120, low: 120, close: 120 }
          ]
        }
      }
    });

    expect(series.all).toEqual([
      { time: Date.UTC(2026, 0, 10) / 1000, value: 240, active_value: 240, realized_pnl: 0 },
      { time: Date.UTC(2026, 0, 12, 12) / 1000, value: 240, active_value: 240, realized_pnl: 0 }
    ]);
  });
});
