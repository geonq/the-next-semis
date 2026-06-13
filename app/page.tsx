import { OverviewClient } from "@/components/overview-client";
import { formatCoingeckoParam, trackedCryptoIds, trackedTickers } from "@/lib/data";
import { getPositions, getWatchlist } from "@/lib/kv";
import { fetchBitstampPerpQuotes, fetchCoinGeckoQuotes, fetchQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [positions, watchlist] = await Promise.all([getPositions(), getWatchlist()]);
  const tickers = trackedTickers(positions, watchlist);
  const cryptoIds = trackedCryptoIds(positions, watchlist);
  const coingeckoParam = formatCoingeckoParam(cryptoIds);
  const perpMarkets = positions
    .filter((p) => p.assetClass === "perp" && p.bitstamp_market)
    .map((p) => p.bitstamp_market!);
  const [yahooQuotes, cgQuotes, initialPerpQuotes] = await Promise.all([
    fetchQuotes(tickers),
    fetchCoinGeckoQuotes(cryptoIds),
    perpMarkets.length > 0 ? fetchBitstampPerpQuotes(perpMarkets) : Promise.resolve({})
  ]);
  const quotes = { ...yahooQuotes, ...cgQuotes };

  return (
    <OverviewClient
      positions={positions}
      initialQuotes={quotes}
      initialPerpQuotes={initialPerpQuotes}
      tickers={tickers}
      coingeckoParam={coingeckoParam}
    />
  );
}
