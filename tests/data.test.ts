import { describe, expect, it } from "vitest";
import { trackedTickers } from "@/lib/data";

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
});
