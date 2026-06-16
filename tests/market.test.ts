import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchHistory,
  fetchQuoteDetails,
  fetchQuotes,
  historyRanges,
  isValidTicker,
  MAX_QUOTE_SYMBOLS,
  MAX_SEARCH_QUERY
} from "@/lib/market";

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

  it("refreshes 1d chart history on the live quote cadence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        chart: {
          result: [
            {
              timestamp: [1],
              indicators: {
                quote: [{ open: [10], high: [12], low: [9], close: [11] }]
              }
            }
          ]
        }
      })
    );

    await fetchHistory("NVDA", "1d");

    expect(String(fetchMock.mock.calls[0][0])).toContain("range=1d&interval=5m");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ next: { revalidate: 30 } });
  });

  it("uses daily candles for all-time history so short-lived charts are not weekly stubs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        chart: {
          result: [
            {
              timestamp: [1],
              indicators: {
                quote: [{ open: [10], high: [12], low: [9], close: [11] }]
              }
            }
          ]
        }
      })
    );

    await fetchHistory("NVDA", "max");

    expect(String(fetchMock.mock.calls[0][0])).toContain("range=max&interval=1d");
  });

  it("keeps long ticker detail history bounded to weekly candles", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        chart: {
          result: [
            {
              timestamp: [1],
              indicators: {
                quote: [{ open: [10], high: [12], low: [9], close: [11] }]
              }
            }
          ]
        }
      })
    );

    await fetchHistory("NVDA", "10y");

    expect(String(fetchMock.mock.calls[0][0])).toContain("range=10y&interval=1wk");
  });

  it("normalizes quote detail fields for discovery scans", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        quoteResponse: {
          result: [
            {
              symbol: "AVAV",
              longName: "AeroVironment, Inc.",
              quoteType: "EQUITY",
              fullExchangeName: "Nasdaq",
              regularMarketPrice: 200,
              marketCap: 4_000_000_000,
              regularMarketVolume: 800_000,
              averageDailyVolume3Month: 700_000
            }
          ]
        }
      })
    );

    await expect(fetchQuoteDetails(["AVAV"])).resolves.toEqual({
      AVAV: {
        ticker: "AVAV",
        company: "AeroVironment, Inc.",
        quoteType: "EQUITY",
        exchange: "Nasdaq",
        price: 200,
        marketCap: 4_000_000_000,
        trailingRevenue: null,
        trailingNetIncome: null,
        volume: 800_000,
        averageVolume: 700_000
      }
    });
  });

  it("estimates missing market cap from quote summary shares outstanding", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://finance.yahoo.com/") return new Response("");
      if (url.includes("/v7/finance/quote")) {
        return Response.json({
          quoteResponse: {
            result: [
              {
                symbol: "TEST",
                longName: "Test Defense Inc.",
                quoteType: "EQUITY",
                fullExchangeName: "Nasdaq",
                regularMarketPrice: 20,
                marketCap: null,
                regularMarketVolume: 500_000,
                averageDailyVolume3Month: 450_000
              }
            ]
          }
        });
      }
      if (url.includes("/v10/finance/quoteSummary/TEST")) {
        return Response.json({
          quoteSummary: {
            result: [
              {
                price: { regularMarketPrice: { raw: 20 } },
                defaultKeyStatistics: { sharesOutstanding: { raw: 100_000_000 } },
                financialData: {
                  totalRevenue: { raw: 250_000_000 },
                  netIncomeToCommon: { raw: 50_000_000 }
                }
              }
            ]
          }
        });
      }
      return Response.json({ chart: { result: [] } });
    });

    await expect(fetchQuoteDetails(["TEST"])).resolves.toMatchObject({
      TEST: {
        marketCap: 2_000_000_000,
        trailingRevenue: 250_000_000,
        trailingNetIncome: 50_000_000
      }
    });
  });
});
