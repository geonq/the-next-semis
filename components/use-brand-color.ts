"use client";

import { useEffect, useState } from "react";

// No client-side persistence: the API already sends `Cache-Control: max-age`, so
// the browser's HTTP cache prevents repeat fetches, and Redis caches server-side.
// A localStorage layer on top only ever served stale colors. Just fetch.

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function useBrandColor(ticker: string, company: string) {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker || !company) return;

    let cancelled = false;
    const params = new URLSearchParams({ ticker, company });
    fetch(`/api/brand-color?${params}`)
      .then((response) => response.json())
      .then(({ color: nextColor }: { color: string | null }) => {
        if (cancelled) return;
        setColor(isHexColor(nextColor) ? nextColor : null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [ticker, company]);

  return color;
}
