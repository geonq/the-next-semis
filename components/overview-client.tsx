"use client";

import { fmtSignedPct, fmtSignedUsd, fmtUsd, signClass } from "@/lib/format";
import { enrichPositions, movers, portfolioSummary } from "@/lib/portfolio";
import type { Position, QuotesByTicker } from "@/lib/types";
import { useLiveQuotes } from "./use-live-quotes";

export function OverviewClient({
  positions,
  initialQuotes,
  tickers
}: {
  positions: Position[];
  initialQuotes: QuotesByTicker;
  tickers: string[];
}) {
  const quotes = useLiveQuotes(initialQuotes, tickers);
  const enriched = enrichPositions(positions, quotes);
  const summary = portfolioSummary(enriched);
  const topGainers = movers(enriched, "desc");
  const topLosers = movers(enriched, "asc");

  return (
    <div className="stack-xl">
      <section>
        <div className="summary-line">
          <span className="hero-number tabular">{fmtUsd(summary.total_value)}</span>
          <div className="summary-delta">
            <span className={`tabular ${signClass(summary.day_change_dollars)}`}>
              {fmtSignedUsd(summary.day_change_dollars)}
            </span>
            <span className={`tabular ${signClass(summary.day_change_percent)}`}>
              {fmtSignedPct(summary.day_change_percent)}
            </span>
            <span className="muted">today</span>
          </div>
        </div>
      </section>

      <section className="hairline">
        <div className="two-col">
          <MoverColumn title="Top Gainers" positions={topGainers} polarity="gain" />
          <MoverColumn title="Top Losers" positions={topLosers} polarity="loss" />
        </div>
      </section>
    </div>
  );
}

function MoverColumn({
  title,
  positions,
  polarity
}: {
  title: string;
  positions: ReturnType<typeof movers>;
  polarity: "gain" | "loss";
}) {
  return (
    <div>
      <p className="section-label">{title}</p>
      <div className="stack-sm">
        {positions.map((position) => (
          <div className="row" key={position.ticker}>
            <div className="row-left">
              <span className="ticker">{position.ticker}</span>
              <span className="subtle">{position.company}</span>
            </div>
            <span className={`tabular ${polarity}`}>{fmtSignedPct(position.day_change_percent)}</span>
          </div>
        ))}
        {positions.length === 0 ? <p className="muted">Awaiting data...</p> : null}
      </div>
    </div>
  );
}
