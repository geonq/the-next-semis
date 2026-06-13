import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupResolvedCandidates, scoreDiscoveryResult, scoreEvidence } from "@/lib/discovery-scoring";
import type { ResolvedArticleCandidate } from "@/lib/discovery-sources";
import type { Candle } from "@/lib/types";

const candles: Candle[] = [
  { time: 1, open: 10, high: 10, low: 10, close: 10 },
  { time: 2, open: 10, high: 10, low: 10, close: 10.1 },
  { time: 3, open: 10, high: 10, low: 10, close: 10.2 },
  { time: 4, open: 10, high: 10, low: 10, close: 10.1 },
  { time: 5, open: 10, high: 10, low: 10, close: 10.15 },
  { time: 6, open: 10, high: 10, low: 10, close: 10.2 }
];

describe("discovery scoring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(12 * 86400 * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scores catalyst evidence and risk evidence separately", () => {
    const evidence = scoreEvidence({
      title: "AeroVironment wins contract for low cost counter-drone defense production",
      url: "https://example.com/story",
      domain: "defensenews.com",
      publishedAt: 1
    });

    expect(evidence.catalystScore).toBeGreaterThan(0);
    expect(evidence.sourceScore).toBeGreaterThan(0);
    expect(evidence.riskScore).toBe(0);
    expect(evidence.matchedTerms).toContain("counter-drone");
  });

  it("groups articles by resolved ticker", () => {
    const candidates: ResolvedArticleCandidate[] = [
      {
        ticker: "AVAV",
        company: "AeroVironment, Inc.",
        exchange: "Nasdaq",
        article: { title: "AeroVironment wins contract", url: "https://a.test", domain: "reuters.com", publishedAt: 1 }
      },
      {
        ticker: "AVAV",
        company: "AeroVironment, Inc.",
        exchange: "Nasdaq",
        article: { title: "AeroVironment production order", url: "https://b.test", domain: "defensenews.com", publishedAt: 2 }
      }
    ];

    expect(groupResolvedCandidates(candidates)).toEqual([
      {
        ticker: "AVAV",
        company: "AeroVironment, Inc.",
        exchange: "Nasdaq",
        articles: [
          { title: "AeroVironment wins contract", url: "https://a.test", domain: "reuters.com", publishedAt: 1 },
          { title: "AeroVironment production order", url: "https://b.test", domain: "defensenews.com", publishedAt: 2 }
        ]
      }
    ]);
  });

  it("builds a candidate score with lag and liquidity flags", () => {
    const result = scoreDiscoveryResult(
      {
        ticker: "AVAV",
        company: "AeroVironment, Inc.",
        exchange: "Nasdaq",
        articles: [
          {
            title: "AeroVironment wins $50 million contract for counter-drone production",
            url: "https://example.com/story",
            domain: "defensenews.com",
            publishedAt: 1
          }
        ]
      },
      {
        ticker: "AVAV",
        company: "AeroVironment, Inc.",
        quoteType: "EQUITY",
        exchange: "Nasdaq",
        price: 100,
        marketCap: 3_000_000_000,
        trailingRevenue: 900_000_000,
        trailingNetIncome: 100_000_000,
        volume: 900_000,
        averageVolume: 700_000
      },
      candles
    );

    expect(result?.discoveryScore).toBeGreaterThan(0);
    expect(result?.tradabilityFlags).toContain("Likely broker-accessible");
    expect(result?.riskFlags).toEqual([]);
    expect(result?.lag.verdict).toBe("hidden");
    expect(result?.lag.postEventAvgDailyMovePercent).not.toBeNull();
    expect(result?.lag.currentMoveSinceCatalystPercent).not.toBeNull();
    expect(result?.materiality.contractToMarketCapPercent).toBeCloseTo(1.6667, 4);
    expect(result?.materiality.contractToRevenuePercent).toBeCloseTo(5.5556, 4);
  });

  it("does not call a catalyst hidden when the stock already repriced after the news", () => {
    const strongReactionCandles: Candle[] = [
      { time: 1, open: 10, high: 10, low: 10, close: 10 },
      { time: 2, open: 10, high: 10, low: 10, close: 10.1 },
      { time: 3, open: 10, high: 10, low: 10, close: 10 },
      { time: 4, open: 10, high: 12, low: 10, close: 12 },
      { time: 5, open: 12, high: 15, low: 12, close: 15 },
      { time: 6, open: 15, high: 18, low: 15, close: 18 },
      { time: 7, open: 18, high: 20, low: 18, close: 20 },
      { time: 8, open: 20, high: 20, low: 20, close: 20 }
    ];

    const result = scoreDiscoveryResult(
      {
        ticker: "NVDA",
        company: "NVIDIA Corporation",
        exchange: "Nasdaq",
        articles: [
          {
            title: "NVIDIA wins $2 billion AI infrastructure contract for production capacity",
            url: "https://example.com/nvda",
            domain: "reuters.com",
            publishedAt: 4
          }
        ]
      },
      {
        ticker: "NVDA",
        company: "NVIDIA Corporation",
        quoteType: "EQUITY",
        exchange: "Nasdaq",
        price: 20,
        marketCap: 5_000_000_000,
        trailingRevenue: 1_000_000_000,
        trailingNetIncome: 400_000_000,
        volume: 10_000_000,
        averageVolume: 9_000_000
      },
      strongReactionCandles
    );

    expect(result?.lag.verdict).toBe("reacted");
    expect(result?.lag.currentMoveSinceCatalystPercent).toBeGreaterThan(60);
    expect(result?.lagScore).toBeLessThan(10);
  });

  it("keeps repriced catalysts visible when extracted value still dwarfs the move", () => {
    const result = scoreDiscoveryResult(
      {
        ticker: "MAT",
        company: "Material Defense Inc.",
        exchange: "Nasdaq",
        articles: [
          {
            title: "Material Defense wins $3 billion production contract for air defense systems",
            url: "https://example.com/material",
            domain: "defense.gov",
            publishedAt: 4
          }
        ]
      },
      {
        ticker: "MAT",
        company: "Material Defense Inc.",
        quoteType: "EQUITY",
        exchange: "Nasdaq",
        price: 15,
        marketCap: 5_000_000_000,
        trailingRevenue: 1_000_000_000,
        trailingNetIncome: 250_000_000,
        volume: 1_000_000,
        averageVolume: 900_000
      },
      [
        { time: 1, open: 10, high: 10, low: 10, close: 10 },
        { time: 2, open: 10, high: 10.2, low: 10, close: 10.1 },
        { time: 3, open: 10.1, high: 10.2, low: 10, close: 10 },
        { time: 4, open: 10, high: 11, low: 10, close: 11 },
        { time: 5, open: 11, high: 12, low: 11, close: 12 },
        { time: 6, open: 12, high: 13, low: 12, close: 13 },
        { time: 7, open: 13, high: 14, low: 13, close: 14 },
        { time: 8, open: 14, high: 15, low: 14, close: 15 }
      ]
    );

    expect(result?.lag.verdict).toBe("reacted_still_interesting");
    expect(result?.materiality.contractToMarketCapPercent).toBe(60);
  });

  it("flags disputed or conditional contract language", () => {
    const result = scoreDiscoveryResult(
      {
        ticker: "EOS.AX",
        company: "Electro Optic Systems Holdings Limited",
        exchange: "Australian Stock Exchange",
        articles: [
          {
            title: "Electro Optic Systems contract disputed by short seller as conditional and misleading",
            url: "https://example.com/eos",
            domain: "reuters.com",
            publishedAt: 1
          }
        ]
      },
      {
        ticker: "EOS.AX",
        company: "Electro Optic Systems Holdings Limited",
        quoteType: "EQUITY",
        exchange: "Australian Stock Exchange",
        price: 6,
        marketCap: 450_000_000,
        trailingRevenue: null,
        trailingNetIncome: null,
        volume: 75_000,
        averageVolume: 80_000
      },
      candles
    );

    expect(result?.riskScore).toBeGreaterThan(0);
    expect(result?.riskFlags).toContain("Risk language in evidence");
    expect(result?.riskFlags).toContain("Thin daily volume");
  });
});
