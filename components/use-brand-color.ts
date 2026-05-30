"use client";

import { useEffect, useState } from "react";

const memoryCache = new Map<string, string>();
const cachePrefix = "brand-color:v9:";

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function useBrandColor(ticker: string, company: string) {
  const cacheKey = `${ticker.toUpperCase()}:${company}`;
  const storageKey = `${cachePrefix}${cacheKey}`;
  const [color, setColor] = useState<string | null>(() => memoryCache.get(cacheKey) ?? null);

  useEffect(() => {
    if (!ticker || !company) return;

    const cached = memoryCache.get(cacheKey) ?? localStorage.getItem(storageKey);
    if (isHexColor(cached)) {
      memoryCache.set(cacheKey, cached);
      setColor(cached);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ ticker, company });
    fetch(`/api/brand-color?${params}`)
      .then((response) => response.json())
      .then(({ color: nextColor }: { color: string | null }) => {
        if (cancelled || !isHexColor(nextColor)) return;
        memoryCache.set(cacheKey, nextColor);
        localStorage.setItem(storageKey, nextColor);
        setColor(nextColor);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [cacheKey, company, storageKey, ticker]);

  return color;
}
