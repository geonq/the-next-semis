import { describe, expect, it } from "vitest";
import { formatCoingeckoParam, trackedCryptoIds, trackedTickers } from "@/lib/data";

describe("data helpers", () => {
  it("deduplicates and sorts tracked tickers across positions and watchlist", () => {
    expect(
      trackedTickers(
        [{ ticker: "NVDA", company: "NVIDIA", shares: 1, average_cost: 1, currency: "USD", sector: "Semis" }],
        [
          { ticker: "ASML", company: "ASML", theme: "Semis", conditions: [], conviction: "draft", status: "watching" },
          { ticker: "NVDA", company: "NVIDIA", theme: "Semis", conditions: [], conviction: "draft", status: "watching" }
        ]
      )
    ).toEqual(["ASML", "NVDA"]);
  });

  it("tracks crypto ids separately for CoinGecko quotes", () => {
    const cryptoIds = trackedCryptoIds(
      [{ ticker: "HYPE", company: "Hyperliquid", assetClass: "crypto", shares: 6, average_cost: 7.5, currency: "USD", sector: "Crypto", coinGeckoId: "hyperliquid" }],
      [
        { ticker: "BTC", company: "Bitcoin", assetType: "crypto", theme: "Crypto", conditions: [], conviction: "draft", status: "watching", brandColor: null, coinGeckoId: "bitcoin" },
        { ticker: "HYPE", company: "Hyperliquid", assetType: "crypto", theme: "Crypto", conditions: [], conviction: "draft", status: "watching", brandColor: null, coinGeckoId: "hyperliquid" }
      ]
    );

    expect(cryptoIds).toEqual([
      { id: "hyperliquid", symbol: "HYPE" },
      { id: "bitcoin", symbol: "BTC" }
    ]);
    expect(formatCoingeckoParam(cryptoIds)).toBe("hyperliquid:HYPE,bitcoin:BTC");
  });
});
