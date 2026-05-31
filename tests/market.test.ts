import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHistory, fetchQuotes, historyRanges, isValidTicker, MAX_QUOTE_SYMBOLS, MAX_SEARCH_QUERY } from "@/lib/market";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("market data helpers", () => {
  it("validates public API ticker and query bounds", () => {
    expect(isValidTicker("NVDA")).toBe(true);
    expect(isValidTicker("RHM.DE")).toBe(true);
    expect(isValidTicker("BRK-B")).toBe(true);
    expect(isValidTicker("EURUSD=X")).toBe(true);
    expect(isValidTicker("^GSPC")).toBe(true);
    expect(isValidTicker("BAD/../../")).toBe(false);
    expect("x".repeat(MAX_SEARCH_QUERY + 1).length).toBeGreaterThan(MAX_SEARCH_QUERY);
    expect(MAX_QUOTE_SYMBOLS).toBe(60);
    expect(historyRanges.has("10y")).toBe(true);
    expect(historyRanges.has("999y")).toBe(false);
  });

  it("normalizes quote responses from Yahoo", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        quoteResponse: {
          result: [
            {
              symbol: "NVDA",
              regularMarketPrice: 135,
              currency: "USD",
              regularMarketChange: 2,
              regularMarketChangePercent: 1.5,
              regularMarketTime: 123
            }
          ]
        }
      })
    );

    await expect(fetchQuotes(["NVDA"])).resolves.toEqual({
      NVDA: {
        ticker: "NVDA",
        price: 135,
        currency: "USD",
        regular_market_change: 2,
        regular_market_change_percent: 1.5,
        timestamp: 123
      }
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("symbols=NVDA");
  });

  it("parses chart history and drops incomplete candles", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        chart: {
          result: [
            {
              timestamp: [1, 2],
              indicators: {
                quote: [{ open: [10, null], high: [12, 13], low: [9, 10], close: [11, 12] }]
              }
            }
          ]
        }
      })
    );

    await expect(fetchHistory("NVDA", "10y")).resolves.toEqual([{ time: 1, open: 10, high: 12, low: 9, close: 11 }]);
  });
});
