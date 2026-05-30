"use client";

import { useEffect, useState } from "react";

// Session-scoped cache: a plain in-memory Map that survives client-side navigation
// (research list <-> ticker card) so a color is fetched once per session and doesn't
// re-flicker on every mount. It lives only in this JS context, so a full page reload
// clears it and re-validates against the server — no long-lived staleness like the
// old localStorage cache caused. `null` is cached too, so monochrome brands (Palantir)
// don't re-fetch either. `has()` distinguishes "not fetched yet" from "fetched -> null".
const sessionCache = new Map<string, string | null>();

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function useBrandColor(ticker: string, company: string) {
  const cacheKey = `${ticker.toUpperCase()}:${company}`;
  const [color, setColor] = useState<string | null>(() => sessionCache.get(cacheKey) ?? null);

  useEffect(() => {
    if (!ticker || !company) return;

    if (sessionCache.has(cacheKey)) {
      setColor(sessionCache.get(cacheKey) ?? null);
      return;
    }

    let cancelled = false;
    // `_` cache-buster + `no-store`: the one network request we make is always fresh,
    // never served from a previously-cached (and now stale) browser entry.
    const params = new URLSearchParams({ ticker, company, _: String(Date.now()) });
    fetch(`/api/brand-color?${params}`, { cache: "no-store" })
      .then((response) => response.json())
      .then(({ color: nextColor }: { color: string | null }) => {
        if (cancelled) return;
        const resolved = isHexColor(nextColor) ? nextColor : null;
        sessionCache.set(cacheKey, resolved);
        setColor(resolved);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [cacheKey, ticker, company]);

  return color;
}
