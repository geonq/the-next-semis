import { cookies } from "next/headers";
import { PortfolioClient } from "@/components/portfolio-client";
import { verifySession } from "@/lib/auth";
import { formatCoingeckoParam, trackedCryptoIds, trackedTickers } from "@/lib/data";
import { getPositions, getWatchlist } from "@/lib/kv";
import { fetchCoinGeckoQuotes, fetchQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const isAdmin = token ? await verifySession(token) : false;

  const [positions, watchlist] = await Promise.all([getPositions(), getWatchlist()]);
  const tickers = trackedTickers(positions, watchlist);
  const cryptoIds = trackedCryptoIds(positions, watchlist);
  const coingeckoParam = formatCoingeckoParam(cryptoIds);
  const [yahooQuotes, cgQuotes] = await Promise.all([
    fetchQuotes(tickers),
    fetchCoinGeckoQuotes(cryptoIds)
  ]);
  const quotes = { ...yahooQuotes, ...cgQuotes };

  return (
    <PortfolioClient
      positions={positions}
      initialQuotes={quotes}
      tickers={tickers}
      coingeckoParam={coingeckoParam}
      watchlist={watchlist}
      isAdmin={isAdmin}
    />
  );
}
