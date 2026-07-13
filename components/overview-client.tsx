"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { fmtSignedPct, fmtSignedUsd, signClass } from "@/lib/format";
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

const usdFormat = { style: "currency" as const, currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** Fade + ~10px rise entrance, staggered by section index. Collapses to instant under reduced motion. */
function useEntrance(index: number) {
  const reduced = useReducedMotion();
  if (reduced) {
    return { initial: false as const, animate: { opacity: 1, y: 0 } };
  }
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: "easeOut" as const, delay: index * 0.05 }
  };
}

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

  const heroEntrance = useEntrance(0);
  const chartEntrance = useEntrance(1);
  const moversEntrance = useEntrance(2);

  return (
    <div className="stack-xl">
      <motion.section {...heroEntrance}>
        <div className="summary-line">
          <NumberFlow
            className="hero-number tabular portfolio-hero-number"
            value={displayedValue}
            locales="en-US"
            format={usdFormat}
            transformTiming={{ duration: 400, easing: "ease-out" }}
            spinTiming={{ duration: 400, easing: "ease-out" }}
          />
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
      </motion.section>

      <motion.div {...chartEntrance}>
        <PortfolioChart seriesByRange={chartSeries} onHoverChange={setChartHover} />
      </motion.div>

      <motion.section className="hairline" {...moversEntrance}>
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
      </motion.section>
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
