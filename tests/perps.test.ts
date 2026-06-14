import { describe, expect, it } from "vitest";
import { BITSTAMP_PERPS, findBitstampPerpByTicker } from "../lib/perps";

describe("perp market helpers", () => {
  it("finds Bitstamp perp metadata by normalized ticker", () => {
    expect(findBitstampPerpByTicker(" btc ")).toEqual({
      ticker: "BTC",
      name: "Bitcoin Perp",
      market: "btcusd-perp"
    });
  });

  it("keeps the known perp list unique by ticker and market", () => {
    expect(new Set(BITSTAMP_PERPS.map((perp) => perp.ticker)).size).toBe(BITSTAMP_PERPS.length);
    expect(new Set(BITSTAMP_PERPS.map((perp) => perp.market)).size).toBe(BITSTAMP_PERPS.length);
  });
});
