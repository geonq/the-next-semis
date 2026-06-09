import { cookies } from "next/headers";
import { PortfolioClient } from "@/components/portfolio-client";
import { verifySession } from "@/lib/auth";
import { getPositions, getWatchlist } from "@/lib/kv";
import { fetchQuotes } from "@/lib/market";
import { trackedTickers } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const isAdmin = token ? await verifySession(token) : false;

  const [positions, watchlist] = await Promise.all([getPositions(), getWatchlist()]);
  const tickers = trackedTickers(positions, watchlist);
  const quotes = await fetchQuotes(tickers);

  return <PortfolioClient positions={positions} initialQuotes={quotes} tickers={tickers} watchlist={watchlist} isAdmin={isAdmin} />;
}
