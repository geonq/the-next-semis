import type {
  BitstampPerpQuotesByMarket,
  Candle,
  CashEntry,
  EnrichedPosition,
  EnrichedRealizedPnlEntry,
  PortfolioChartRange,
  PortfolioChartSeriesByRange,
  PortfolioSummary,
  Position,
  QuotesByTicker,
  RealizedPnlEntry,
  RealizedPnlSummary
} from "./types";

export function weightedAverageCost(
  existingShares: number,
  existingAverageCost: number,
  addedShares: number,
  addedAverageCost: number
): number {
  const totalShares = existingShares + addedShares;
  if (totalShares <= 0) return 0;
  return ((existingShares * existingAverageCost) + (addedShares * addedAverageCost)) / totalShares;
}

export function enrichPositions(
  positions: Position[],
  quotes: QuotesByTicker,
  perpQuotes: BitstampPerpQuotesByMarket = {}
): EnrichedPosition[] {
  return positions.map((position) => {
    if (position.assetClass === "perp") {
      const market = position.bitstamp_market;
      const perpQuote = market ? perpQuotes[market] : undefined;
      if (!perpQuote || perpQuote.mark_price == null) return { ...position, quote_status: "no_data" };

      const direction = position.side === "short" ? -1 : 1;
      const markPrice = perpQuote.mark_price;
      const notional = position.shares * markPrice;
      const entryPrice = position.average_cost;
      const unrealizedPnl = position.shares * (markPrice - entryPrice) * direction;
      const marginUsed = position.margin_used
        ?? (position.leverage ? (position.shares * entryPrice) / position.leverage : position.shares * entryPrice);
      const totalValue = marginUsed + unrealizedPnl;
      const pnlPercent = marginUsed > 0 ? (unrealizedPnl / marginUsed) * 100 : 0;

      return {
        ...position,
        mark_price: markPrice,
        current_price: markPrice,
        notional,
        total_value: totalValue,
        pnl_dollars: unrealizedPnl,
        pnl_percent: pnlPercent,
        day_change: null,
        day_change_percent: null,
        funding_rate: perpQuote.funding_rate
      };
    }

    const quote = quotes[position.ticker];
    if (!quote || quote.price == null) return { ...position, quote_status: "no_data" };

    const costBasis = position.average_cost_usd ?? position.average_cost;
    const totalValue = position.shares * quote.price;
    const pnlDollars = position.shares * (quote.price - costBasis);
    const pnlPercent = costBasis > 0 ? ((quote.price - costBasis) / costBasis) * 100 : 0;

    return {
      ...position,
      current_price: quote.price,
      total_value: totalValue,
      pnl_dollars: pnlDollars,
      pnl_percent: pnlPercent,
      day_change: quote.regular_market_change,
      day_change_percent: quote.regular_market_change_percent
    };
  });
}

export function portfolioSummary(positions: EnrichedPosition[]): PortfolioSummary {
  const withData = positions.filter((position) => position.total_value != null);
  const totalValue = withData.reduce((sum, position) => sum + (position.total_value ?? 0), 0);
  const dayChangeDollars = withData.reduce((sum, position) => {
    if (position.assetClass === "perp") return sum;
    return sum + position.shares * (position.day_change ?? 0);
  }, 0);
  const dayChangePercent = totalValue > 0 ? (dayChangeDollars / (totalValue - dayChangeDollars)) * 100 : 0;

  return {
    total_value: totalValue,
    day_change_dollars: dayChangeDollars,
    day_change_percent: dayChangePercent
  };
}

export function accountSummary(
  positions: EnrichedPosition[],
  realizedEntries: EnrichedRealizedPnlEntry[],
  cashEntries: CashEntry[]
): PortfolioSummary {
  const positionSummary = portfolioSummary(positions);
  if (cashEntries.length === 0) return positionSummary;

  const netCashFlows = cashFlowsTotal(cashEntries);
  const totalRealizedPnl = realizedEntries.reduce((sum, entry) => sum + entry.realized_pnl, 0);
  const activePnl = positions.reduce((sum, position) => sum + (position.pnl_dollars ?? 0), 0);
  const totalValue = netCashFlows + totalRealizedPnl + activePnl;
  const dayChangeDollars = positionSummary.day_change_dollars;

  return {
    total_value: totalValue,
    day_change_dollars: dayChangeDollars,
    day_change_percent: totalValue > dayChangeDollars
      ? (dayChangeDollars / (totalValue - dayChangeDollars)) * 100
      : 0
  };
}

export function movers(positions: EnrichedPosition[], direction: "asc" | "desc"): EnrichedPosition[] {
  return positions
    .filter((position) => {
      const pct = position.assetClass === "perp" ? position.pnl_percent : position.day_change_percent;
      if (typeof pct !== "number") return false;
      return direction === "asc" ? pct < 0 : pct > 0;
    })
    .sort((a, b) => {
      const left = (a.assetClass === "perp" ? a.pnl_percent : a.day_change_percent) ?? 0;
      const right = (b.assetClass === "perp" ? b.pnl_percent : b.day_change_percent) ?? 0;
      return direction === "asc" ? left - right : right - left;
    })
    .slice(0, 3);
}

export function enrichRealizedPnl(entries: RealizedPnlEntry[]): EnrichedRealizedPnlEntry[] {
  return entries.map((entry) => {
    const costBasis = entry.quantity * entry.entry_price;
    const returnBasis =
      entry.assetClass === "perp"
        ? entry.margin_used ?? (entry.leverage ? costBasis / entry.leverage : costBasis)
        : costBasis;
    const grossPnl =
      entry.side === "short"
        ? entry.quantity * (entry.entry_price - entry.exit_price)
        : entry.quantity * (entry.exit_price - entry.entry_price);
    const realizedPnl = grossPnl - (entry.fees ?? 0);
    const realizedPnlPercent = returnBasis > 0 ? (realizedPnl / returnBasis) * 100 : 0;

    return {
      ...entry,
      cost_basis: costBasis,
      return_basis: returnBasis,
      gross_pnl: grossPnl,
      realized_pnl: realizedPnl,
      realized_pnl_percent: realizedPnlPercent
    };
  });
}

export function realizedPnlSummary(entries: EnrichedRealizedPnlEntry[]): RealizedPnlSummary {
  const winners = entries.filter((entry) => entry.realized_pnl > 0);
  const losers = entries.filter((entry) => entry.realized_pnl < 0);
  const totalRealizedPnl = entries.reduce((sum, entry) => sum + entry.realized_pnl, 0);

  return {
    total_realized_pnl: totalRealizedPnl,
    winners: winners.length,
    losers: losers.length,
    win_rate: entries.length > 0 ? (winners.length / entries.length) * 100 : 0,
    average_winner: winners.length > 0 ? winners.reduce((sum, entry) => sum + entry.realized_pnl, 0) / winners.length : 0,
    average_loser: losers.length > 0 ? losers.reduce((sum, entry) => sum + entry.realized_pnl, 0) / losers.length : 0
  };
}

export function realizedPnlLeaders(
  entries: EnrichedRealizedPnlEntry[],
  direction: "winners" | "losers",
  limit = 5
): EnrichedRealizedPnlEntry[] {
  return entries
    .filter((entry) => (direction === "winners" ? entry.realized_pnl > 0 : entry.realized_pnl < 0))
    .sort((a, b) =>
      direction === "winners" ? b.realized_pnl - a.realized_pnl : a.realized_pnl - b.realized_pnl
    )
    .slice(0, limit);
}

export const portfolioChartRanges = ["live", "1d", "1w", "1month", "ytd", "all"] as const;

export type PortfolioChartHistoryRange = "1d" | "5d" | "1mo" | "1y" | "max";

export type PortfolioChartHistories = Partial<Record<PortfolioChartHistoryRange, Record<string, Candle[]>>>;

const secondsPerDay = 24 * 60 * 60;

function startOfUtcYear(timestamp: number): number {
  const date = new Date(timestamp * 1000);
  return Date.UTC(date.getUTCFullYear(), 0, 1) / 1000;
}

function rangeStart(range: PortfolioChartRange, now: number): number {
  if (range === "live") return now - secondsPerDay;
  if (range === "1d") return now - secondsPerDay;
  if (range === "1w") return now - 7 * secondsPerDay;
  if (range === "1month") return now - 30 * secondsPerDay;
  if (range === "ytd") return startOfUtcYear(now);
  return 0;
}

export function historySourceForPortfolioRange(range: PortfolioChartRange): PortfolioChartHistoryRange {
  if (range === "live" || range === "1d") return "1d";
  if (range === "1w") return "5d";
  if (range === "1month") return "1mo";
  if (range === "ytd") return "1y";
  return "max";
}

function dateToUtcSeconds(date: string): number | null {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function isHistoricalPosition(position: Position): boolean {
  return position.assetClass !== "perp" && position.shares > 0;
}

function positionCostBasis(position: Position): number {
  return position.shares * (position.average_cost_usd ?? position.average_cost);
}

export function cashFlowsTotal(entries: CashEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.amount_usd ?? entry.amount), 0);
}

export function estimatedCashBalance(
  cashEntries: CashEntry[],
  positions: Position[],
  realizedEntries: EnrichedRealizedPnlEntry[]
): number {
  const activeCostBasis = positions.reduce((sum, position) => {
    if (position.assetClass === "perp") return sum + (position.margin_used ?? positionCostBasis(position));
    return sum + positionCostBasis(position);
  }, 0);
  const realizedPnl = realizedEntries.reduce((sum, entry) => sum + entry.realized_pnl, 0);
  return cashFlowsTotal(cashEntries) + realizedPnl - activeCostBasis;
}

export function buildPortfolioChartSeries({
  positions,
  realizedPnl,
  cashEntries = [],
  histories,
  now = Math.floor(Date.now() / 1000)
}: {
  positions: Position[];
  realizedPnl: RealizedPnlEntry[];
  cashEntries?: CashEntry[];
  histories: PortfolioChartHistories;
  now?: number;
}): PortfolioChartSeriesByRange {
  const hasCashLedger = cashEntries.length > 0;
  const cashFlows = cashEntries
    .map((entry) => ({
      time: dateToUtcSeconds(entry.date),
      value: entry.amount_usd ?? entry.amount
    }))
    .filter((entry): entry is { time: number; value: number } => entry.time != null)
    .sort((a, b) => a.time - b.time);
  const realizedEntries = enrichRealizedPnl(realizedPnl)
    .map((entry) => ({
      closedAt: dateToUtcSeconds(entry.closed_at),
      value: entry.realized_pnl
    }))
    .filter((entry): entry is { closedAt: number; value: number } => entry.closedAt != null)
    .sort((a, b) => a.closedAt - b.closedAt);

  const series = Object.fromEntries(
    portfolioChartRanges.map((range) => {
      const source = historySourceForPortfolioRange(range);
      const sourceHistories = histories[source] ?? {};
      const start = rangeStart(range, now);
      const baselineTime = start > 0 ? start : undefined;
      const positionsWithEntryTime = positions
        .filter(isHistoricalPosition)
        .map((position) => ({
          position,
          entryTime: position.entry_date ? dateToUtcSeconds(position.entry_date) : null,
          history: (sourceHistories[position.ticker] ?? []).filter((candle) => candle.time <= now)
        }));

      const times = new Set<number>();
      if (baselineTime != null) times.add(baselineTime);

      for (const { history } of positionsWithEntryTime) {
        for (const candle of history) {
          if (candle.time >= start && candle.time <= now) times.add(candle.time);
        }
      }
      for (const entry of realizedEntries) {
        if (entry.closedAt >= start && entry.closedAt <= now) times.add(entry.closedAt);
      }
      for (const entry of cashFlows) {
        if (entry.time >= start && entry.time <= now) {
          if (entry.time - 1 >= start) times.add(entry.time - 1);
          times.add(entry.time);
        }
      }
      times.add(now);

      const sortedTimes = Array.from(times).sort((a, b) => a - b);
      const lastCloseByTicker = new Map<string, number>();
      const historyIndexByTicker = new Map<string, number>();
      let realizedIndex = 0;
      let cumulativeRealized = 0;
      let cashIndex = 0;
      let cumulativeCash = 0;

      while (realizedIndex < realizedEntries.length && realizedEntries[realizedIndex].closedAt < start) {
        cumulativeRealized += realizedEntries[realizedIndex].value;
        realizedIndex += 1;
      }
      while (cashIndex < cashFlows.length && cashFlows[cashIndex].time < start) {
        cumulativeCash += cashFlows[cashIndex].value;
        cashIndex += 1;
      }

      return [
        range,
        sortedTimes.flatMap((time) => {
          while (cashIndex < cashFlows.length && cashFlows[cashIndex].time <= time) {
            cumulativeCash += cashFlows[cashIndex].value;
            cashIndex += 1;
          }
          while (realizedIndex < realizedEntries.length && realizedEntries[realizedIndex].closedAt <= time) {
            cumulativeRealized += realizedEntries[realizedIndex].value;
            realizedIndex += 1;
          }

          let activeValue = 0;
          let activeUnrealizedPnl = 0;
          for (const { position, entryTime, history } of positionsWithEntryTime) {
            let index = historyIndexByTicker.get(position.ticker) ?? 0;
            while (index < history.length && history[index].time <= time) {
              lastCloseByTicker.set(position.ticker, history[index].close);
              index += 1;
            }
            historyIndexByTicker.set(position.ticker, index);

            if (entryTime != null && time < entryTime) continue;
            const close = lastCloseByTicker.get(position.ticker);
            if (close == null) continue;
            activeValue += position.shares * close;
            activeUnrealizedPnl += position.shares * (close - (position.average_cost_usd ?? position.average_cost));
          }

          const value = hasCashLedger
            ? cumulativeCash + cumulativeRealized + activeUnrealizedPnl
            : activeValue + cumulativeRealized;
          if (value === 0) return [];
          return [{
            time,
            value,
            active_value: activeValue,
            realized_pnl: cumulativeRealized
          }];
        })
      ];
    })
  );

  return series as PortfolioChartSeriesByRange;
}
