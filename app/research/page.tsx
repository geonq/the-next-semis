import { ResearchClient } from "@/components/research-client";
import { loadPositions, loadThesis, loadWatchlist, trackedTickers } from "@/lib/data";
import { fetchQuotes } from "@/lib/market";
import { convictions, themes } from "@/lib/research";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const [positions, watchlist, thesis] = await Promise.all([loadPositions(), loadWatchlist(), loadThesis()]);
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
      />

      <section className="hairline">
        <p className="section-label">Thesis</p>
        <div className="thesis">{renderMarkdown(thesis)}</div>
      </section>
    </div>
  );
}
