"use client";

import { useEffect, useMemo, useState } from "react";
import type { BitstampPerpQuotesByMarket } from "@/lib/types";

export function useLivePerpQuotes(
  initialQuotes: BitstampPerpQuotesByMarket,
  markets: string[]
): BitstampPerpQuotesByMarket {
  const [quotes, setQuotes] = useState(initialQuotes);
  const marketsParam = useMemo(() => markets.join(","), [markets]);

  useEffect(() => {
    if (!marketsParam) return;

    let cancelled = false;

    async function refresh() {
      const response = await fetch(`/api/perps?markets=${encodeURIComponent(marketsParam)}`, {
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
  }, [marketsParam]);

  return quotes;
}
