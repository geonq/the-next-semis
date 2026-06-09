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
