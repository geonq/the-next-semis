import { OverviewClient } from "@/components/overview-client";
import { formatCoingeckoParam, trackedCryptoIds, trackedTickers } from "@/lib/data";
import { getCashEntries, getPositions, getRealizedPnl, getWatchlist } from "@/lib/kv";
import {
  bitstampPerpMarketSymbol,
  fetchBitstampPerpHistory,
  fetchBitstampPerpQuotesWithHistory,
  fetchCoinGeckoHistory,
  fetchCoinGeckoQuotes,
  fetchHistory,
  fetchQuotes
} from "@/lib/market";
import {
  buildPortfolioChartSeries,
  historySourceForPortfolioRange,
  portfolioHistoryKey,
  portfolioChartRanges,
  type PortfolioChartHistoryRange,
  type PortfolioChartHistories
} from "@/lib/portfolio";
import type { Candle, Position } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchPortfolioChartHistories(positions: Position[]): Promise<PortfolioChartHistories> {
  const active = positions.filter((position) => position.shares > 0);
  const ranges = Array.from(new Set(portfolioChartRanges.map(historySourceForPortfolioRange)));
  const histories: PortfolioChartHistories = {};

  await Promise.all(
    ranges.map(async (range) => {
      const entries = await Promise.all(
        active.map(async (position): Promise<[string, Candle[]]> => {
          let history: Candle[];
          let historyPosition = position;
          if (position.assetClass === "perp") {
            const market = bitstampPerpMarketSymbol(position.ticker, position.bitstamp_market);
            history = market ? await fetchBitstampPerpHistory(market, range) : [];
            if (market) historyPosition = { ...position, bitstamp_market: market };
          } else if (position.coinGeckoId) {
            if (range === "1d") {
              history = await fetchCoinGeckoHistory(position.coinGeckoId, range);
              if (history.length === 0) history = await fetchHistory(position.ticker, range);
            } else {
              history = await fetchCoinGeckoHistory(position.coinGeckoId, range);
            }
          } else {
            history = await fetchHistory(position.ticker, range);
          }
          return [portfolioHistoryKey(historyPosition), history];
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
  const [yahooQuotes, cgQuotes, chartHistories] = await Promise.all([
    fetchQuotes(tickers),
    fetchCoinGeckoQuotes(cryptoIds),
    fetchPortfolioChartHistories(positions)
  ]);
  const dayHistoryByMarket = Object.fromEntries(
    perpMarkets.flatMap((market) => {
      const normalizedMarket = bitstampPerpMarketSymbol(market);
      const history = normalizedMarket ? chartHistories["1d"]?.[`perp:${normalizedMarket}`] : undefined;
      return normalizedMarket && history?.length ? [[normalizedMarket, history] as const] : [];
    })
  );
  const initialPerpQuotes = perpMarkets.length > 0
    ? await fetchBitstampPerpQuotesWithHistory(perpMarkets, dayHistoryByMarket)
    : {};
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
