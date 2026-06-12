import type { EnrichedPosition, PortfolioSummary, Position, QuotesByTicker } from "./types";

export function enrichPositions(positions: Position[], quotes: QuotesByTicker): EnrichedPosition[] {
  return positions.map((position) => {
    const quote = quotes[position.ticker];
    if (!quote || quote.price == null) return { ...position, quote_status: "no_data" };

    const totalValue = position.shares * quote.price;
    const pnlDollars = position.shares * (quote.price - position.average_cost);
    const pnlPercent =
      position.average_cost > 0 ? ((quote.price - position.average_cost) / position.average_cost) * 100 : 0;

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
