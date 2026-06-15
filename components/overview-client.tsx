"use client";

import { useEffect, useRef, useState } from "react";
import { fmtSignedPct, fmtSignedUsd, fmtUsd, signClass } from "@/lib/format";
import { accountSummary, enrichPositions, enrichRealizedPnl, movers } from "@/lib/portfolio";
import type {
  BitstampPerpQuotesByMarket,
  CashEntry,
  PortfolioChartSeriesByRange,
  Position,
  QuotesByTicker,
  RealizedPnlEntry
} from "@/lib/types";
import { PortfolioChart, type PortfolioChartHover } from "./portfolio-chart";
import { useLiveQuotes } from "./use-live-quotes";
import { useLivePerpQuotes } from "./use-live-perp-quotes";

export function OverviewClient({
  positions,
  realizedPnl,
  cashEntries,
  chartSeries,
  initialQuotes,
  initialPerpQuotes,
  tickers,
  coingeckoParam
}: {
  positions: Position[];
  realizedPnl: RealizedPnlEntry[];
  cashEntries: CashEntry[];
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
  const realizedEntries = enrichRealizedPnl(realizedPnl);
  const summary = accountSummary(enriched, realizedEntries, cashEntries);
  const topGainers = movers(enriched, "desc");
  const topLosers = movers(enriched, "asc");
  const [chartHover, setChartHover] = useState<PortfolioChartHover>(null);
  const displayedValue = chartHover?.point.value ?? summary.total_value;
  const displayedChange = chartHover ? chartHover.change : summary.day_change_dollars;
  const displayedChangePct = chartHover ? chartHover.changePct : summary.day_change_percent;
  const displayedLabel = chartHover ? chartHover.label : "today";

  return (
    <div className="stack-xl">
      <section>
        <div className="summary-line">
          <RollingPortfolioValue value={displayedValue} />
          <div className="summary-delta">
            <span className={`tabular ${signClass(displayedChange)}`}>
              {fmtSignedUsd(displayedChange)}
            </span>
            <span className={`tabular ${signClass(displayedChangePct)}`}>
              {fmtSignedPct(displayedChangePct)}
            </span>
            <span className="muted">{displayedLabel}</span>
          </div>
        </div>
      </section>

      <PortfolioChart seriesByRange={chartSeries} onHoverChange={setChartHover} />

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

function RollingPortfolioValue({ value }: { value: number }) {
  const previous = useRef(value);
  const [direction, setDirection] = useState<"roll-up" | "roll-down">("roll-up");
  const valueKey = Math.round(value * 100);

  useEffect(() => {
    if (value === previous.current) return;
    setDirection(value > previous.current ? "roll-up" : "roll-down");
    previous.current = value;
  }, [value]);

  return (
    <span key={valueKey} className={`hero-number tabular portfolio-hero-number ${direction}`}>
      {fmtUsd(value)}
    </span>
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
