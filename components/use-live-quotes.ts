"use client";

import { useEffect, useMemo, useState } from "react";
import type { QuotesByTicker } from "@/lib/types";

export function useLiveQuotes(
  initialQuotes: QuotesByTicker,
  tickers: string[],
  coingeckoParam?: string
): QuotesByTicker {
  const [quotes, setQuotes] = useState(initialQuotes);
  const symbols = useMemo(() => tickers.join(","), [tickers]);

  useEffect(() => {
    if (!symbols && !coingeckoParam) return;

    let cancelled = false;

    async function refresh() {
      let url = `/api/quotes?symbols=${encodeURIComponent(symbols)}`;
      if (coingeckoParam) url += `&coingecko=${encodeURIComponent(coingeckoParam)}`;
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok || cancelled) return;
      setQuotes(await response.json());
    }

    const timer = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbols, coingeckoParam]);

  return quotes;
}
