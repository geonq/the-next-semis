import { OverviewClient } from "@/components/overview-client";
import { trackedTickers } from "@/lib/data";
import { getPositions, getWatchlist } from "@/lib/kv";
import { fetchQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [positions, watchlist] = await Promise.all([getPositions(), getWatchlist()]);
  const tickers = trackedTickers(positions, watchlist);
  const quotes = await fetchQuotes(tickers);

  return <OverviewClient positions={positions} initialQuotes={quotes} tickers={tickers} />;
}
