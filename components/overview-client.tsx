"use client";

import { fmtSignedPct, fmtSignedUsd, fmtUsd, signClass } from "@/lib/format";
import { enrichPositions, movers, portfolioSummary } from "@/lib/portfolio";
import type { BitstampPerpQuotesByMarket, PortfolioChartSeriesByRange, Position, QuotesByTicker } from "@/lib/types";
import { PortfolioChart } from "./portfolio-chart";
import { useLiveQuotes } from "./use-live-quotes";
import { useLivePerpQuotes } from "./use-live-perp-quotes";

export function OverviewClient({
  positions,
  chartSeries,
  initialQuotes,
  initialPerpQuotes,
  tickers,
  coingeckoParam
}: {
  positions: Position[];
  chartSeries: PortfolioChartSeriesByRange;
  initialQuotes: QuotesByTicker;
  initialPerpQuotes: BitstampPerpQuotesByMarket;
  tickers: string[];
  coingeckoParam?: string;
}) {
  const perpMarkets = positions
    .filter((p) => p.assetClass === "perp" && p.bitstamp_market)
    .map((p) => p.bitstamp_market!);
  const quotes = useLiveQuotes(initialQuotes, tickers, coingeckoParam);
  const perpQuotes = useLivePerpQuotes(initialPerpQuotes, perpMarkets);
  const enriched = enrichPositions(positions, quotes, perpQuotes);
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

      <PortfolioChart seriesByRange={chartSeries} totalValue={summary.total_value} />

      <section className="hairline">
        <div className="two-col">
          <MoverColumn
            title="Top Gainers"
            positions={topGainers}
            polarity="gain"
            emptyText="No positions moved higher today."
          />
          <MoverColumn
            title="Top Losers"
            positions={topLosers}
            polarity="loss"
            emptyText="No positions moved lower today."
          />
        </div>
      </section>
    </div>
  );
}

function MoverColumn({
  title,
  positions,
  polarity,
  emptyText
}: {
  title: string;
  positions: ReturnType<typeof movers>;
  polarity: "gain" | "loss";
  emptyText: string;
}) {
  return (
    <div>
      <p className="section-label">{title}</p>
      <div className="stack-sm">
        {positions.map((position) => (
          <div className="row" key={position.ticker}>
            <div className="row-left">
              <span className="ticker">
                {position.ticker}
                {position.assetClass === "perp" && position.side ? (
                  <span className={`perp-side-badge ${position.side}`}>{position.side === "long" ? "L" : "S"}</span>
                ) : null}
              </span>
              <span className="subtle">{position.company}</span>
            </div>
            <span className={`tabular ${polarity}`}>
              {fmtSignedPct(position.day_change_percent ?? position.pnl_percent)}
            </span>
          </div>
        ))}
        {positions.length === 0 ? <p className="muted">{emptyText}</p> : null}
      </div>
    </div>
  );
}
