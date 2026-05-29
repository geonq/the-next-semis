import type { EnrichedWatchlistEntry, QuotesByTicker, WatchlistEntry } from "./types";

export function enrichWatchlist(entries: WatchlistEntry[], quotes: QuotesByTicker): EnrichedWatchlistEntry[] {
  return entries.map((entry) => {
    const quote = quotes[entry.ticker];
    if (!quote || quote.price == null) return { ...entry, quote_status: "no_data" };

    return {
      ...entry,
      current_price: quote.price,
      day_change: quote.regular_market_change,
      day_change_percent: quote.regular_market_change_percent
    };
  });
}

export function themes(entries: WatchlistEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.theme))).sort();
}

export function convictions(entries: WatchlistEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.conviction))).sort();
}
