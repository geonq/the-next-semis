import { cookies } from "next/headers";
import { PortfolioClient } from "@/components/portfolio-client";
import { verifySession } from "@/lib/auth";
import { formatCoingeckoParam, trackedCryptoIds, trackedTickers } from "@/lib/data";
import { getPositions, getRealizedPnl, getWatchlist } from "@/lib/kv";
import { fetchBitstampPerpQuotes, fetchCoinGeckoQuotes, fetchQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const isAdmin = token ? await verifySession(token) : false;

  const [positions, realizedPnl, watchlist] = await Promise.all([getPositions(), getRealizedPnl(), getWatchlist()]);
  const tickers = trackedTickers(positions, watchlist);
  const cryptoIds = trackedCryptoIds(positions, watchlist);
  const coingeckoParam = formatCoingeckoParam(cryptoIds);
  const perpMarkets = [...new Set([
    ...positions.filter((p) => p.assetClass === "perp" && p.bitstamp_market).map((p) => p.bitstamp_market!),
    ...realizedPnl.filter((e) => e.assetClass === "perp" && e.bitstamp_market).map((e) => e.bitstamp_market!)
  ])];
  const [yahooQuotes, cgQuotes, initialPerpQuotes] = await Promise.all([
    fetchQuotes(tickers),
    fetchCoinGeckoQuotes(cryptoIds),
    perpMarkets.length > 0 ? fetchBitstampPerpQuotes(perpMarkets) : Promise.resolve({})
  ]);
  const quotes = { ...yahooQuotes, ...cgQuotes };

  return (
    <PortfolioClient
      positions={positions}
      realizedPnl={realizedPnl}
      initialQuotes={quotes}
      initialPerpQuotes={initialPerpQuotes}
      tickers={tickers}
      coingeckoParam={coingeckoParam}
      watchlist={watchlist}
      isAdmin={isAdmin}
    />
  );
}
