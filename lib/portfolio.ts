import type {
  EnrichedPosition,
  EnrichedRealizedPnlEntry,
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

export function enrichPositions(positions: Position[], quotes: QuotesByTicker): EnrichedPosition[] {
  return positions.map((position) => {
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
  const dayChangeDollars = withData.reduce(
    (sum, position) => sum + position.shares * (position.day_change ?? 0),
    0
  );
  const dayChangePercent = totalValue > 0 ? (dayChangeDollars / (totalValue - dayChangeDollars)) * 100 : 0;

  return {
    total_value: totalValue,
    day_change_dollars: dayChangeDollars,
    day_change_percent: dayChangePercent
  };
}

export function movers(positions: EnrichedPosition[], direction: "asc" | "desc"): EnrichedPosition[] {
  return positions
    .filter((position) => {
      if (typeof position.day_change_percent !== "number") return false;
      return direction === "asc" ? position.day_change_percent < 0 : position.day_change_percent > 0;
    })
    .sort((a, b) => {
      const left = a.day_change_percent ?? 0;
      const right = b.day_change_percent ?? 0;
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
