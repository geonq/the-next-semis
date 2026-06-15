export type Position = {
  ticker: string;
  company: string;
  assetClass?: "stock" | "crypto" | "perp";
  shares: number;
  average_cost: number;
  average_cost_usd?: number;
  entry_date?: string;
  currency: string;
  sector: string;
  thesis_id?: string;
  coinGeckoId?: string;
  // Crypto spot staking
  staking_provider?: string;
  staked_amount?: number;
  staking_apy?: number;
  // Perp-specific
  side?: "long" | "short";
  leverage?: number;
  margin_mode?: "isolated" | "shared";
  margin_used?: number;
  bitstamp_market?: string;
};

export type CashEntry = {
  id: string;
  amount: number;
  amount_usd?: number;
  currency: "USD" | "EUR" | "GBP" | "JPY";
  date: string;
  note?: string;
};

export type RealizedPnlEntry = {
  id: string;
  ticker: string;
  company: string;
  assetClass?: "stock" | "crypto" | "perp";
  side: "long" | "short";
  quantity: number;
  entry_price: number;
  exit_price: number;
  fees?: number;
  leverage?: number;
  margin_mode?: "isolated" | "shared";
  margin_used?: number;
  bitstamp_market?: string;
  currency: string;
  opened_at?: string;
  closed_at: string;
  sector?: string;
  note?: string;
};

export type DiscoveryContext = {
  sectorName: string;
  scannedAt: number;
  discoveryScore: number;
  catalystScore: number;
  lagScore: number;
  riskScore: number;
  contractValue: number | null;
  contractValueLabel: string | null;
  contractToMarketCapPercent: number | null;
  contractToRevenuePercent: number | null;
  contractToNetIncomePercent: number | null;
  marketCap: number | null;
  trailingRevenue: number | null;
  lagVerdict: DiscoveryLag["verdict"];
  catalystDate: number | null;
  daysSinceCatalyst: number | null;
  postEventMovePercent: number | null;
  currentMoveSinceCatalystPercent: number | null;
  riskFlags: string[];
  topEvidence: Array<{ title: string; url: string; domain: string; publishedAt: number | null }>;
};

export type WatchlistEntry = {
  ticker: string;
  company: string;
  assetType: "equity" | "etf" | "crypto";
  theme: string;
  conditions: string[];
  conviction: string;
  status: string;
  brandColor: string | null;
  buyTrigger?: string;
  coinGeckoId?: string;
  discoveryContext?: DiscoveryContext;
};

export type Quote = {
  ticker: string;
  price: number | null;
  currency: string | null;
  regular_market_change: number | null;
  regular_market_change_percent: number | null;
  timestamp: number | null;
};

export type QuotesByTicker = Record<string, Quote>;

export type BitstampPerpQuote = {
  market_symbol: string;
  market: string | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  mark_price: number | null;
  index_price: number | null;
  open_interest: number | null;
  open_interest_value: number | null;
  funding_rate: number | null;
  next_funding_time: number | null;
  timestamp: number | null;
};

export type BitstampPerpQuotesByMarket = Record<string, BitstampPerpQuote>;

export type EnrichedPosition = Position & {
  current_price?: number;
  total_value?: number;
  pnl_dollars?: number;
  pnl_percent?: number;
  day_change?: number | null;
  day_change_percent?: number | null;
  quote_status?: "no_data";
  // Perp-specific (from Bitstamp)
  mark_price?: number;
  notional?: number;
  funding_rate?: number | null;
};

export type PortfolioSummary = {
  total_value: number;
  day_change_dollars: number;
  day_change_percent: number;
};

export type PortfolioChartRange = "live" | "1d" | "1w" | "1month" | "ytd" | "all";

export type PortfolioChartPoint = {
  time: number;
  value: number;
  active_value: number;
  realized_pnl: number;
};

export type PortfolioChartSeriesByRange = Record<PortfolioChartRange, PortfolioChartPoint[]>;

export type RealizedPnlSummary = {
  total_realized_pnl: number;
  winners: number;
  losers: number;
  win_rate: number;
  average_winner: number;
  average_loser: number;
};

export type EnrichedRealizedPnlEntry = RealizedPnlEntry & {
  cost_basis: number;
  return_basis: number;
  gross_pnl: number;
  realized_pnl: number;
  realized_pnl_percent: number;
};

export type EnrichedWatchlistEntry = WatchlistEntry & {
  current_price?: number;
  day_change?: number | null;
  day_change_percent?: number | null;
  quote_status?: "no_data";
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type NewsItem = {
  title: string;
  link: string;
  publisher: string;
  publishedAt: number;
};

export type DiscoveryNewsRef = {
  title: string;
  url: string;
  domain: string;
  publishedAt: number | null;
};

export type DiscoveryEvidence = {
  title: string;
  url: string;
  domain: string;
  publishedAt: number | null;
  sourceCountry?: string;
  extractedValue: number | null;
  extractedValueLabel: string | null;
  catalystScore: number;
  sourceScore: number;
  riskScore: number;
  matchedTerms: string[];
  riskTerms: string[];
};

export type DiscoveryMateriality = {
  contractValue: number | null;
  contractValueLabel: string | null;
  score: number;
  contractToMarketCapPercent: number | null;
  contractToRevenuePercent: number | null;
  contractToNetIncomePercent: number | null;
  confidence: "low" | "medium" | "high";
  flags: string[];
};

export type DiscoveryLag = {
  score: number;
  catalystDate: number | null;
  daysSinceCatalyst: number | null;
  eventWindowDays: number;
  benchmarkWindowDays: number;
  postEventMovePercent: number | null;
  postEventAvgDailyMovePercent: number | null;
  currentMoveSinceCatalystPercent: number | null;
  currentAvgDailyMovePercent: number | null;
  baselineAvgDailyMovePercent: number | null;
  excessMovePercent: number | null;
  hiddenMovePercent: number | null;
  verdict: "hidden" | "declined" | "reacted" | "reacted_still_interesting" | "too_early" | "unknown" | "stale";
  explanation: string;
};

export type DiscoveryResult = {
  ticker: string;
  company: string;
  exchange: string | null;
  discoveryScore: number;
  catalystScore: number;
  lagScore: number;
  lag: DiscoveryLag;
  riskScore: number;
  priceChange5d: number | null;
  priceChange1mo: number | null;
  marketCap: number | null;
  trailingRevenue: number | null;
  trailingNetIncome: number | null;
  volume: number | null;
  materiality: DiscoveryMateriality;
  riskFlags: string[];
  tradabilityFlags: string[];
  evidence: DiscoveryEvidence[];
  badNews?: DiscoveryNewsRef[];
};

export type DiscoveryScanResponse = {
  sector: string;
  sectorName: string;
  scannedAt: number;
  sources: string[];
  results: DiscoveryResult[];
  debug?: {
    articles: number;
    resolved: number;
    grouped: number;
    sampleTitles?: string[];
    sampleTickers?: string[];
  };
  error?: string;
};

export type SavedItem = {
  id: string;
  type: "article" | "paper";
  title: string;
  url: string;
  note?: string;
  theme?: string;
  tickers: string[];
  addedAt: number;
};

export type ResearchDoc = {
  id: string;
  name: string;
  type: "md" | "pdf";
  size: number;
  blobUrl: string;
  addedAt: number;
};
