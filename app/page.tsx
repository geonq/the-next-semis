import { OverviewClient } from "@/components/overview-client";
import { formatCoingeckoParam, trackedCryptoIds, trackedTickers } from "@/lib/data";
import { getPositions, getWatchlist } from "@/lib/kv";
import { fetchCoinGeckoQuotes, fetchQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [positions, watchlist] = await Promise.all([getPositions(), getWatchlist()]);
  const tickers = trackedTickers(positions, watchlist);
  const cryptoIds = trackedCryptoIds(positions, watchlist);
  const coingeckoParam = formatCoingeckoParam(cryptoIds);
  const [yahooQuotes, cgQuotes] = await Promise.all([
    fetchQuotes(tickers),
    fetchCoinGeckoQuotes(cryptoIds)
  ]);
  const quotes = { ...yahooQuotes, ...cgQuotes };

  return <OverviewClient positions={positions} initialQuotes={quotes} tickers={tickers} coingeckoParam={coingeckoParam} />;
}
