import { cookies } from "next/headers";
import { ResearchClient } from "@/components/research-client";
import { ResearchDocs } from "@/components/research-docs";
import { SectorDiscovery } from "@/components/sector-discovery";
import { ThesisEditor } from "@/components/thesis-editor";
import { verifySession } from "@/lib/auth";
import { formatCoingeckoParam, trackedCryptoIds, trackedTickers } from "@/lib/data";
import { getPositions, getResearchDocs, getSavedItems, getThesis, getWatchlist } from "@/lib/kv";
import { fetchCoinGeckoQuotes, fetchQuotes } from "@/lib/market";
import { themes } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const isAdmin = token ? await verifySession(token) : false;

  const [positions, watchlist, thesis, savedItems, researchDocs] = await Promise.all([
    getPositions(),
    getWatchlist(),
    getThesis(),
    getSavedItems(),
    getResearchDocs()
  ]);
  const tickers = trackedTickers(positions, watchlist);
  const cryptoIds = trackedCryptoIds(positions, watchlist);
  const coingeckoParam = formatCoingeckoParam(cryptoIds);
  const [yahooQuotes, cgQuotes] = await Promise.all([
    fetchQuotes(tickers),
    fetchCoinGeckoQuotes(cryptoIds)
  ]);
  const quotes = { ...yahooQuotes, ...cgQuotes };

  return (
    <div className="stack-lg">
      <ResearchClient
        entries={watchlist}
        initialQuotes={quotes}
        tickers={tickers}
        coingeckoParam={coingeckoParam}
        themes={themes(watchlist)}
        isAdmin={isAdmin}
        savedItems={savedItems}
      />

      {isAdmin ? <SectorDiscovery /> : null}

      <ResearchDocs docs={researchDocs} isAdmin={isAdmin} />

      <ThesisEditor markdown={thesis} isAdmin={isAdmin} />
    </div>
  );
}
