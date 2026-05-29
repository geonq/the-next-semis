import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceChart } from "@/components/price-chart";
import { fmtAbs, fmtSignedPct, fmtSignedUsd, signClass } from "@/lib/format";
import { loadWatchlist } from "@/lib/data";
import { fetchHistory, fetchQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();
  const entries = await loadWatchlist();
  const entry = entries.find((candidate) => candidate.ticker === ticker);
  if (!entry) notFound();

  const [quotes, history] = await Promise.all([fetchQuotes([ticker]), fetchHistory(ticker, "1mo")]);
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
              {ticker}
              <span className="ticker-company">{entry.company}</span>
            </h1>
            <p className="subtle">{entry.theme}</p>
          </div>

          <div className="price-block">
            {quote?.price != null ? (
              <>
                <p className="hero-number tabular">${fmtAbs(quote.price)}</p>
                <p className={`tabular ${signClass(quote.regular_market_change_percent)}`}>
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

      <PriceChart history={history} />

      <section className="detail-grid">
        <div>
          <p className="section-label">Status</p>
          <div>
            <span className={convictionClass(entry.conviction)}>{entry.conviction}</span>
            <span className="dot">·</span>
            <span className={statusClass(entry.status)}>{entry.status}</span>
          </div>
        </div>

        <div>
          <p className="section-label">Entry Conditions</p>
          <ul className="conditions">
            {entry.conditions.map((condition) => (
              <li className="condition" key={condition}>
                <span className="muted">-</span>
                {condition}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function convictionClass(value: string): string {
  if (value === "high") return "gain";
  if (value === "medium") return "accent";
  return "neutral";
}

function statusClass(value: string): string {
  if (value === "triggered") return "gain";
  if (value === "invalidated") return "loss";
  return "neutral";
}
