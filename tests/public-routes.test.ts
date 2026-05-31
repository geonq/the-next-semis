import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as history } from "@/app/api/history/[ticker]/route";
import { GET as news } from "@/app/api/news/[ticker]/route";
import { GET as quotes } from "@/app/api/quotes/route";
import { GET as search } from "@/app/api/search/route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public API route caps", () => {
  it("deduplicates, validates, and caps quote symbols before fetching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        quoteResponse: { result: [] }
      })
    );
    const symbols = Array.from({ length: 70 }, (_, index) => `T${index}`).concat(["NVDA", "BAD/../", "NVDA"]);

    const response = await quotes(new Request(`https://app.test/api/quotes?symbols=${symbols.join(",")}`));

    expect(response.status).toBe(200);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    const requestedSymbols = new URL(requestedUrl).searchParams.get("symbols")?.split(",");
    expect(requestedSymbols).toHaveLength(60);
    expect(requestedSymbols).not.toContain("BAD/../");
  });

  it("drops oversized search queries before Yahoo fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await search(new Request(`https://app.test/api/search?q=${"x".repeat(65)}`));

    await expect(response.json()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid history/news tickers without fetching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      (await history(new Request("https://app.test/api/history/BAD?range=10y"), { params: Promise.resolve({ ticker: "BAD/.." }) })).json()
    ).resolves.toEqual([]);
    await expect(
      (await news(new Request("https://app.test/api/news/BAD"), { params: Promise.resolve({ ticker: "BAD/.." }) })).json()
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coerces unknown history ranges to 10y", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        chart: { result: [] }
      })
    );

    await history(new Request("https://app.test/api/history/NVDA?range=999y"), {
      params: Promise.resolve({ ticker: "NVDA" })
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain("range=10y");
  });
});
