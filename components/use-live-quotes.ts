"use client";

import { useEffect, useMemo, useState } from "react";
import type { QuotesByTicker } from "@/lib/types";

export function useLiveQuotes(initialQuotes: QuotesByTicker, tickers: string[]): QuotesByTicker {
  const [quotes, setQuotes] = useState(initialQuotes);
  const symbols = useMemo(() => tickers.join(","), [tickers]);

  useEffect(() => {
    if (!symbols) return;

    let cancelled = false;

    async function refresh() {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, {
        cache: "no-store"
      });

      if (!response.ok || cancelled) return;
      setQuotes(await response.json());
    }

    const timer = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbols]);

  return quotes;
}
