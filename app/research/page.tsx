import { cookies } from "next/headers";
import { ResearchClient } from "@/components/research-client";
import { ThesisEditor } from "@/components/thesis-editor";
import { verifySession } from "@/lib/auth";
import { trackedTickers } from "@/lib/data";
import { getPositions, getSavedItems, getThesis, getWatchlist } from "@/lib/kv";
import { fetchQuotes } from "@/lib/market";
import { themes } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const isAdmin = token ? await verifySession(token) : false;

  const [positions, watchlist, thesis, savedItems] = await Promise.all([
    getPositions(),
    getWatchlist(),
    getThesis(),
    getSavedItems()
  ]);
  const tickers = trackedTickers(positions, watchlist);
  const quotes = await fetchQuotes(tickers);

  return (
    <div className="stack-lg">
      <ResearchClient
        entries={watchlist}
        initialQuotes={quotes}
        tickers={tickers}
        themes={themes(watchlist)}
        isAdmin={isAdmin}
        savedItems={savedItems}
      />

      <ThesisEditor markdown={thesis} isAdmin={isAdmin} />
    </div>
  );
}
