export type Position = {
  ticker: string;
  company: string;
  shares: number;
  average_cost: number;
  currency: string;
  sector: string;
  thesis_id?: string;
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

export type EnrichedPosition = Position & {
  current_price?: number;
  total_value?: number;
  pnl_dollars?: number;
  pnl_percent?: number;
  day_change?: number | null;
  day_change_percent?: number | null;
  quote_status?: "no_data";
};

export type PortfolioSummary = {
  total_value: number;
  day_change_dollars: number;
  day_change_percent: number;
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
  verdict: "hidden" | "declined" | "reacted" | "reacted_still_interesting" | "too_early" | "unknown";
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
