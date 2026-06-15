import { OverviewClient } from "@/components/overview-client";
import { formatCoingeckoParam, trackedCryptoIds, trackedTickers } from "@/lib/data";
import { getCashEntries, getPositions, getRealizedPnl, getWatchlist } from "@/lib/kv";
import { fetchBitstampPerpQuotes, fetchCoinGeckoHistory, fetchCoinGeckoQuotes, fetchHistory, fetchQuotes } from "@/lib/market";
import {
  buildPortfolioChartSeries,
  historySourceForPortfolioRange,
  portfolioChartRanges,
  type PortfolioChartHistoryRange,
  type PortfolioChartHistories
} from "@/lib/portfolio";
import type { Candle, Position } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchPortfolioChartHistories(positions: Position[]): Promise<PortfolioChartHistories> {
  const active = positions.filter((position) => position.assetClass !== "perp" && position.shares > 0);
  const ranges = Array.from(new Set(portfolioChartRanges.map(historySourceForPortfolioRange)));
  const histories: PortfolioChartHistories = {};

  await Promise.all(
    ranges.map(async (range) => {
      const entries = await Promise.all(
        active.map(async (position): Promise<[string, Candle[]]> => {
          const history = position.coinGeckoId
            ? await fetchCoinGeckoHistory(position.coinGeckoId, range)
            : await fetchHistory(position.ticker, range);
          return [position.ticker, history];
        })
      );
      histories[range as PortfolioChartHistoryRange] = Object.fromEntries(entries);
    })
  );

  return histories;
}

export default async function OverviewPage() {
  const [positions, realizedPnl, cashEntries, watchlist] = await Promise.all([
    getPositions(),
    getRealizedPnl(),
    getCashEntries(),
    getWatchlist()
  ]);
  const tickers = trackedTickers(positions, watchlist);
  const cryptoIds = trackedCryptoIds(positions, watchlist);
  const coingeckoParam = formatCoingeckoParam(cryptoIds);
  const perpMarkets = positions
    .filter((p) => p.assetClass === "perp" && p.bitstamp_market)
    .map((p) => p.bitstamp_market!);
  const [yahooQuotes, cgQuotes, initialPerpQuotes, chartHistories] = await Promise.all([
    fetchQuotes(tickers),
    fetchCoinGeckoQuotes(cryptoIds),
    perpMarkets.length > 0 ? fetchBitstampPerpQuotes(perpMarkets) : Promise.resolve({}),
    fetchPortfolioChartHistories(positions)
  ]);
  const quotes = { ...yahooQuotes, ...cgQuotes };
  const chartSeries = buildPortfolioChartSeries({ positions, realizedPnl, cashEntries, histories: chartHistories });

  return (
    <OverviewClient
      positions={positions}
      realizedPnl={realizedPnl}
      cashEntries={cashEntries}
      chartSeries={chartSeries}
      initialQuotes={quotes}
      initialPerpQuotes={initialPerpQuotes}
      tickers={tickers}
      coingeckoParam={coingeckoParam}
    />
  );
}
