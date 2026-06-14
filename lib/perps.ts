export type BitstampPerpMarket = {
  ticker: string;
  name: string;
  market: string;
};

export const BITSTAMP_PERPS = [
  { ticker: "BTC", name: "Bitcoin Perp", market: "btcusd-perp" },
  { ticker: "ETH", name: "Ethereum Perp", market: "ethusd-perp" },
  { ticker: "SOL", name: "Solana Perp", market: "solusd-perp" },
  { ticker: "XRP", name: "XRP Perp", market: "xrpusd-perp" },
  { ticker: "LTC", name: "Litecoin Perp", market: "ltcusd-perp" },
  { ticker: "LINK", name: "Chainlink Perp", market: "linkusd-perp" },
  { ticker: "ADA", name: "Cardano Perp", market: "adausd-perp" },
  { ticker: "DOGE", name: "Dogecoin Perp", market: "dogeusd-perp" },
  { ticker: "AVAX", name: "Avalanche Perp", market: "avaxusd-perp" },
  { ticker: "DOT", name: "Polkadot Perp", market: "dotusd-perp" },
  { ticker: "UNI", name: "Uniswap Perp", market: "uniusd-perp" },
  { ticker: "AAVE", name: "Aave Perp", market: "aaveusd-perp" }
] as const satisfies readonly BitstampPerpMarket[];

export function findBitstampPerpByTicker(ticker: string): BitstampPerpMarket | undefined {
  const normalized = ticker.trim().toUpperCase();
  return BITSTAMP_PERPS.find((perp) => perp.ticker === normalized);
}
