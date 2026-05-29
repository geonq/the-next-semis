import { PortfolioClient } from "@/components/portfolio-client";
import { loadPositions, loadWatchlist, trackedTickers } from "@/lib/data";
import { fetchQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const [positions, watchlist] = await Promise.all([loadPositions(), loadWatchlist()]);
  const tickers = trackedTickers(positions, watchlist);
  const quotes = await fetchQuotes(tickers);

  return <PortfolioClient positions={positions} initialQuotes={quotes} tickers={tickers} />;
}
