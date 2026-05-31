import { describe, expect, it } from "vitest";
import { enrichWatchlist, themes } from "@/lib/research";
import type { QuotesByTicker, WatchlistEntry } from "@/lib/types";

const entries: WatchlistEntry[] = [
  {
    ticker: "ASML",
    company: "ASML Holding",
    theme: "Semiconductor equipment",
    conditions: ["Advanced-node demand accelerates"],
    conviction: "draft",
    status: "watching"
  },
  {
    ticker: "PLTR",
    company: "Palantir",
    theme: "Defense",
    conditions: ["Gov demand expands"],
    conviction: "medium",
    status: "watching"
  }
];

const quotes: QuotesByTicker = {
  ASML: {
    ticker: "ASML",
    price: 900,
    currency: "EUR",
    regular_market_change: 12,
    regular_market_change_percent: 1.35,
    timestamp: 1
  }
};

describe("research helpers", () => {
  it("merges quote data into watchlist entries and marks missing quotes", () => {
    const [asml, pltr] = enrichWatchlist(entries, quotes);

    expect(asml.current_price).toBe(900);
    expect(asml.day_change).toBe(12);
    expect(asml.day_change_percent).toBe(1.35);
    expect(pltr.quote_status).toBe("no_data");
  });

  it("returns sorted unique themes", () => {
    expect(themes(entries)).toEqual(["Defense", "Semiconductor equipment"]);
  });
});
