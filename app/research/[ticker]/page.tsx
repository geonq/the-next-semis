import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { BrandTicker } from "@/components/brand-ticker";
import { DiscoveryIntelPanel } from "@/components/discovery-intel-panel";
import { NewsPanel } from "@/components/news-panel";
import { PriceChart } from "@/components/price-chart";
import { ReadingList } from "@/components/reading-list";
import { TickerStateEditor } from "@/components/ticker-state-editor";
import { verifySession } from "@/lib/auth";
import { capitalizeFirst, fmtAbs, fmtSignedPct, fmtSignedUsd, signClass } from "@/lib/format";
import { getSavedItems, getWatchlist } from "@/lib/kv";
import { fetchCoinGeckoHistory, fetchCoinGeckoQuotes, fetchHistory, fetchQuotes } from "@/lib/market";
import { themes } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const isAdmin = token ? await verifySession(token) : false;
  const [entries, savedItems] = await Promise.all([getWatchlist(), getSavedItems()]);
  const entry = entries.find((candidate) => candidate.ticker === ticker);
  if (!entry) notFound();

  const [quotes, history] = entry.coinGeckoId
    ? await Promise.all([
        fetchCoinGeckoQuotes([{ id: entry.coinGeckoId, symbol: ticker }]),
        fetchCoinGeckoHistory(entry.coinGeckoId, "max")
      ])
    : await Promise.all([fetchQuotes([ticker]), fetchHistory(ticker, "10y")]);
  const quote = quotes[ticker];

  return (
    <div className="stack-lg">
      <section>
        <Link className="back-link" href="/research">
          ← Research
        </Link>

        <div className="ticker-hero">
          <div>
            <h1 className="ticker-title">
              <BrandTicker
                ticker={ticker}
                company={entry.company}
                brandColor={entry.brandColor}
                className="ticker-title-symbol"
              />
              <span className="ticker-company">{entry.company}</span>
            </h1>
            <p className="meta-line ticker-meta">
              <span className="meta-chip meta-chip-primary">{capitalizeFirst(entry.theme)}</span>
              <span className="meta-chip">{entry.assetType}</span>
            </p>
          </div>

          <div className="price-block">
            {quote?.price != null ? (
              <>
                <p className="hero-number tabular">${fmtAbs(quote.price)}</p>
                <p className={`price-delta tabular ${signClass(quote.regular_market_change_percent)}`}>
                  {fmtSignedPct(quote.regular_market_change_percent)}{" "}
                  <span className="muted">({fmtSignedUsd(quote.regular_market_change)})</span>
                </p>
              </>
            ) : (
              <p className="muted">Awaiting quote...</p>
            )}
          </div>
        </div>
      </section>

      <PriceChart history={history} ticker={ticker} company={entry.company} brandColor={entry.brandColor} />

      {entry.discoveryContext && <DiscoveryIntelPanel ctx={entry.discoveryContext} />}

      <TickerStateEditor
        ticker={ticker}
        conviction={entry.conviction}
        status={entry.status}
        conditions={entry.conditions}
        buyTrigger={entry.buyTrigger}
        isAdmin={isAdmin}
      />

      <ReadingList
        items={savedItems.filter((item) => item.tickers.includes(ticker))}
        allItems={savedItems}
        ticker={ticker}
        defaultTheme={entry.theme}
        isAdmin={isAdmin}
        themes={themes(entries)}
      />

      <NewsPanel ticker={ticker} />
    </div>
  );
}
