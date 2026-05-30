import { cookies } from "next/headers";
import { ResearchClient } from "@/components/research-client";
import { verifySession } from "@/lib/auth";
import { loadThesis, trackedTickers } from "@/lib/data";
import { getPositions, getWatchlist } from "@/lib/kv";
import { fetchQuotes } from "@/lib/market";
import { renderMarkdown } from "@/lib/markdown";
import { convictions, themes } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const isAdmin = token ? await verifySession(token) : false;

  const [positions, watchlist, thesis] = await Promise.all([getPositions(), getWatchlist(), loadThesis()]);
  const tickers = trackedTickers(positions, watchlist);
  const quotes = await fetchQuotes(tickers);

  return (
    <div className="stack-lg">
      <ResearchClient
        entries={watchlist}
        initialQuotes={quotes}
        tickers={tickers}
        themes={themes(watchlist)}
        convictions={convictions(watchlist)}
        isAdmin={isAdmin}
      />

      <section className="hairline">
        <p className="section-label">Thesis</p>
        <div className="thesis">{renderMarkdown(thesis)}</div>
      </section>
    </div>
  );
}
