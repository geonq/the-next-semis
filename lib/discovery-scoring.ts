import type { Candle, DiscoveryEvidence, DiscoveryLag, DiscoveryMateriality, DiscoveryNewsRef, DiscoveryResult } from "./types";
import type { DiscoveryArticle, ResolvedArticleCandidate } from "./discovery-sources";
import type { QuoteDetail } from "./market";

type CandidateInput = {
  ticker: string;
  company: string;
  exchange: string | null;
  articles: DiscoveryArticle[];
};

const catalystWeights: Array<[string, number]> = [
  ["contract awarded", 8],
  ["awarded contract", 8],
  ["wins contract", 8],
  ["contract win", 7],
  ["contract wins", 7],
  ["selected by", 6],
  ["selected for", 6],
  ["procurement", 6],
  ["order", 5],
  ["purchase order", 6],
  ["production", 4],
  ["funding", 5],
  ["billion", 5],
  ["million", 2],
  ["supply agreement", 7],
  ["capacity expansion", 6],
  ["expands capacity", 5],
  ["partnership", 4],
  ["strategic partnership", 6],
  ["acquires", 4],
  ["acquisition", 4],
  ["approval", 6],
  ["fda approval", 8],
  ["phase 1", 4],
  ["phase 2", 6],
  ["phase 3", 7],
  ["clinical data", 6],
  ["trial data", 6],
  ["positive data", 7],
  ["positive phase", 7],
  ["meets endpoint", 8],
  ["meets end point", 8],
  ["breakthrough therapy", 7],
  ["license agreement", 6],
  ["milestone payment", 5],
  ["offtake", 7],
  ["offtake agreement", 8],
  ["mining permit", 7],
  ["permit approval", 7],
  ["resource discovery", 6],
  ["rare earth deal", 7],
  ["critical minerals", 4],
  ["mineral processing", 5],
  ["domestic mining", 4],
  ["magnet materials", 4],
  ["data center", 5],
  ["ai data center", 7],
  ["server orders", 6],
  ["chip supply", 6],
  ["semiconductor capacity", 6],
  ["semiconductor equipment", 5],
  ["chip equipment", 5],
  ["hbm supply", 7],
  ["hbm memory", 5],
  ["ai accelerator", 6],
  ["foundry", 4],
  ["wafer fab", 5],
  ["wafer fabrication", 5],
  ["advanced packaging", 5],
  ["test equipment", 4],
  ["metrology", 4],
  ["eda", 4],
  ["design win", 5],
  ["optical networking", 5],
  ["optical interconnect", 5],
  ["liquid cooling", 4],
  ["silicon photonics", 5],
  ["co-packaged optics", 5],
  ["cybersecurity contract", 7],
  ["zero trust", 5],
  ["government cyber", 6],
  ["identity security", 4],
  ["cloud security", 4],
  ["post quantum", 5],
  ["robotics deal", 6],
  ["robotics contract", 7],
  ["automation contract", 6],
  ["warehouse automation", 5],
  ["surgical robot", 5],
  ["autonomous mobile robot", 5],
  ["counter drone", 6],
  ["counter-drone", 6],
  ["c-uas", 6],
  ["anti-drone", 5],
  ["drone defense", 6],
  ["high energy laser", 6],
  ["directed energy", 5],
  ["microwave", 4],
  ["electronic warfare", 5],
  ["loitering munition", 5],
  ["unmanned systems", 4],
  ["air defense", 4],
  ["cost reduction", 6],
  ["reduces cost", 6],
  ["low cost", 4],
  ["scale production", 5],
  ["production capacity", 4],
  ["nato", 3],
  ["ukraine", 3],
  ["army", 3],
  ["navy", 3],
  ["department of defense", 4],
  ["dod", 4]
];

const riskWeights: Array<[string, number]> = [
  ["short seller", 8],
  ["short-seller", 8],
  ["allegation", 6],
  ["misleading", 7],
  ["non-binding", 7],
  ["conditional", 5],
  ["contract dispute", 8],
  ["lawsuit", 5],
  ["probe", 5],
  ["investigation", 6],
  ["cancelled", 8],
  ["canceled", 8],
  ["delay", 3],
  ["offering", 5],
  ["dilution", 6],
  ["going concern", 8],
  ["fraud", 9],
  ["bankruptcy", 10]
];

export function groupResolvedCandidates(candidates: ResolvedArticleCandidate[]): CandidateInput[] {
  const byTicker = new Map<string, CandidateInput>();
  for (const candidate of candidates) {
    const current = byTicker.get(candidate.ticker);
    if (current) {
      current.articles.push(candidate.article);
      continue;
    }
    byTicker.set(candidate.ticker, {
      ticker: candidate.ticker,
      company: candidate.company,
      exchange: candidate.exchange,
      articles: [candidate.article]
    });
  }
  return Array.from(byTicker.values());
}

export function scoreDiscoveryResult(
  candidate: CandidateInput,
  detail: QuoteDetail | undefined,
  candles: Candle[]
): DiscoveryResult | null {
  const evidence = candidate.articles
    .map(scoreEvidence)
    .filter((item) => item.catalystScore > 0 || item.riskScore > 0)
    .sort((a, b) => b.catalystScore + b.sourceScore - b.riskScore - (a.catalystScore + a.sourceScore - a.riskScore))
    .slice(0, 5);

  const catalystScore = sum(evidence.map((item) => item.catalystScore + item.sourceScore));
  const riskScore = sum(evidence.map((item) => item.riskScore));
  if (catalystScore <= 0) return null;

  const marketCap = detail?.marketCap ?? null;
  const trailingRevenue = detail?.trailingRevenue ?? null;
  const trailingNetIncome = detail?.trailingNetIncome ?? null;
  const volume = detail?.volume ?? detail?.averageVolume ?? null;
  const materiality = calculateMateriality(evidence, marketCap, trailingRevenue, trailingNetIncome);
  const priceChange5d = priceChange(candles, 6);
  const priceChange1mo = priceChange(candles, Math.min(22, candles.length));
  const lag = calculateLag(evidence, candles, catalystScore, materiality);
  const riskFlags = riskFlagsFor({ evidence, marketCap, volume, priceChange1mo, exchange: detail?.exchange ?? candidate.exchange });
  const tradabilityFlags = tradabilityFlagsFor(detail?.exchange ?? candidate.exchange, volume, marketCap);
  const rawDiscoveryScore = Math.max(
    0,
    catalystScore * 1.6 + materiality.score + lag.score - riskScore * 1.25 - riskFlags.length * 1.5
  );

  return {
    ticker: candidate.ticker,
    company: detail?.company ?? candidate.company,
    exchange: detail?.exchange ?? candidate.exchange,
    discoveryScore: round(normalizeDiscoveryScore(rawDiscoveryScore)),
    catalystScore: round(catalystScore),
    lagScore: round(lag.score),
    lag,
    riskScore: round(riskScore),
    priceChange5d: priceChange5d == null ? null : round(priceChange5d),
    priceChange1mo: priceChange1mo == null ? null : round(priceChange1mo),
    marketCap,
    trailingRevenue,
    trailingNetIncome,
    volume,
    materiality,
    riskFlags,
    tradabilityFlags,
    evidence,
    badNews: [] as DiscoveryNewsRef[]
  };
}

export function scoreEvidence(article: DiscoveryArticle): DiscoveryEvidence {
  const title = article.title.toLowerCase();
  const matchedTerms: string[] = [];
  const riskTerms: string[] = [];
  const catalystScore = catalystWeights.reduce((score, [term, weight]) => {
    if (!title.includes(term)) return score;
    matchedTerms.push(term);
    return score + weight;
  }, 0);
  const riskScore = riskWeights.reduce((score, [term, weight]) => {
    if (!title.includes(term)) return score;
    riskTerms.push(term);
    return score + weight;
  }, 0);

  return {
    title: article.title,
    url: article.url,
    domain: article.domain,
    publishedAt: article.publishedAt,
    sourceCountry: article.sourceCountry,
    extractedValue: extractMoneyValue(article.title)?.value ?? null,
    extractedValueLabel: extractMoneyValue(article.title)?.label ?? null,
    catalystScore,
    sourceScore: sourceScore(article.domain),
    riskScore,
    matchedTerms,
    riskTerms
  };
}

function calculateMateriality(
  evidence: DiscoveryEvidence[],
  marketCap: number | null,
  trailingRevenue: number | null,
  trailingNetIncome: number | null
): DiscoveryMateriality {
  const valuedEvidence = evidence
    .filter((item) => item.extractedValue != null)
    .sort((a, b) => (b.extractedValue ?? 0) - (a.extractedValue ?? 0));
  const best = valuedEvidence[0];
  const contractValue = best?.extractedValue ?? null;
  const flags: string[] = [];
  if (contractValue == null) flags.push("No contract/program value extracted");
  if (marketCap == null) flags.push("Market cap unavailable");
  if (trailingRevenue == null) flags.push("Trailing revenue unavailable");
  if (trailingNetIncome == null) flags.push("Net income unavailable");
  if (evidence.some((item) => /up to|idiq|framework|potential|maximum/i.test(item.title))) flags.push("Value may be ceiling, not committed revenue");
  if (evidence.some((item) => /multi-year|through 20\d\d|to 20\d\d/i.test(item.title))) flags.push("Likely multi-year revenue");

  const hasOfficialishSource = evidence.some((item) => item.sourceScore >= 4);
  const confidence = contractValue == null || marketCap == null
    ? "low"
    : flags.some((flag) => flag.includes("ceiling"))
      ? "medium"
      : hasOfficialishSource
        ? "high"
        : "medium";

  const contractToMarketCapPercent = contractValue != null && marketCap ? round((contractValue / marketCap) * 100) : null;
  const contractToRevenuePercent = contractValue != null && trailingRevenue ? round((contractValue / trailingRevenue) * 100) : null;
  const contractToNetIncomePercent = contractValue != null && trailingNetIncome && trailingNetIncome > 0
    ? round((contractValue / trailingNetIncome) * 100)
    : null;

  return {
    contractValue,
    contractValueLabel: best?.extractedValueLabel ?? null,
    score: materialityScore(contractToMarketCapPercent, contractToRevenuePercent, contractToNetIncomePercent, confidence),
    contractToMarketCapPercent,
    contractToRevenuePercent,
    contractToNetIncomePercent,
    confidence,
    flags
  };
}

function materialityScore(
  contractToMarketCapPercent: number | null,
  contractToRevenuePercent: number | null,
  contractToNetIncomePercent: number | null,
  confidence: DiscoveryMateriality["confidence"]
): number {
  const marketCapComponent = contractToMarketCapPercent == null ? 0 : Math.min(12, contractToMarketCapPercent * 1.4);
  const revenueComponent = contractToRevenuePercent == null ? 0 : Math.min(10, contractToRevenuePercent * 0.8);
  const earningsComponent = contractToNetIncomePercent == null ? 0 : Math.min(14, contractToNetIncomePercent * 0.25);
  const confidenceMultiplier = confidence === "high" ? 1 : confidence === "medium" ? 0.75 : 0.45;
  return round((marketCapComponent + revenueComponent + earningsComponent) * confidenceMultiplier);
}

function extractMoneyValue(text: string): { value: number; label: string } | null {
  const matches = Array.from(
    text.matchAll(/(?:[$€£]\s?([0-9]+(?:\.[0-9]+)?)\s?(billion|million|bn|m|b)?|([0-9]+(?:\.[0-9]+)?)\s?(billion|million|bn|m)\s?(?:dollars|usd|eur|euros|pounds|gbp)?)/gi)
  );
  const parsed = matches.flatMap((match) => {
    const numeric = Number(match[1] ?? match[3]);
    if (!Number.isFinite(numeric)) return [];
    const unit = String(match[2] ?? match[4] ?? "").toLowerCase();
    const multiplier = unit.startsWith("b") ? 1_000_000_000 : unit ? 1_000_000 : 1;
    if (multiplier === 1 && numeric < 1000) return [];
    return [{ value: numeric * multiplier, label: match[0].trim() }];
  });
  return parsed.sort((a, b) => b.value - a.value)[0] ?? null;
}

export function priceChange(candles: Candle[], lookbackCandles: number): number | null {
  if (candles.length < 2 || lookbackCandles < 2) return null;
  const latest = candles.at(-1);
  const previous = candles.at(-lookbackCandles) ?? candles[0];
  if (!latest || !previous || previous.close === 0) return null;
  return (latest.close - previous.close) / previous.close;
}

function calculateLag(
  evidence: DiscoveryEvidence[],
  candles: Candle[],
  catalystScore: number,
  materiality: DiscoveryMateriality
): DiscoveryLag {
  const catalyst = evidence
    .filter((item) => item.publishedAt != null)
    .sort((a, b) => {
      const left = a.catalystScore + a.sourceScore - a.riskScore;
      const right = b.catalystScore + b.sourceScore - b.riskScore;
      if (right !== left) return right - left;
      return (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
    })[0];

  if (!catalyst?.publishedAt) {
    return emptyLag("unknown", "No catalyst publication date, so post-news reaction cannot be measured.");
  }

  const sorted = candles.slice().sort((a, b) => a.time - b.time);
  const startIndex = sorted.findIndex((candle) => candle.time >= catalyst.publishedAt!);
  if (startIndex < 0) {
    return {
      ...emptyLag("unknown", "Catalyst is newer than available price history."),
      catalystDate: catalyst.publishedAt,
      daysSinceCatalyst: Math.max(0, Math.floor((Date.now() / 1000 - catalyst.publishedAt) / 86400))
    };
  }

  const eventTradingDays = 10;
  const endIndex = Math.min(sorted.length - 1, startIndex + eventTradingDays);
  const eventCandles = sorted.slice(startIndex, endIndex + 1);
  if (eventCandles.length < 3) {
    return {
      ...emptyLag("too_early", "Fewer than three trading candles since the catalyst; reaction window is too early."),
      catalystDate: catalyst.publishedAt,
      daysSinceCatalyst: Math.max(0, Math.floor((Date.now() / 1000 - catalyst.publishedAt) / 86400))
    };
  }

  const start = eventCandles[0];
  const end = eventCandles.at(-1)!;
  const latest = sorted.at(-1)!;
  const postEventMovePercent = ((end.close - start.close) / start.close) * 100;
  const postEventAvgDailyMovePercent = averageAbsDailyMove(eventCandles);
  const currentMoveSinceCatalystPercent = ((latest.close - start.close) / start.close) * 100;
  const currentCandles = sorted.slice(startIndex);
  const currentAvgDailyMovePercent = averageAbsDailyMove(currentCandles);
  const baselineCandles = sorted.slice(Math.max(0, startIndex - 31), startIndex + 1);
  const baselineAvgDailyMovePercent = baselineCandles.length >= 3 ? averageAbsDailyMove(baselineCandles) : null;
  const normalDailyMove = baselineAvgDailyMovePercent ?? 2;
  const eventNormalWindowMove = normalDailyMove * Math.sqrt(Math.max(1, eventCandles.length - 1));
  const currentNormalWindowMove = normalDailyMove * Math.sqrt(Math.max(1, currentCandles.length - 1));
  const excessMovePercent = Math.max(0, Math.abs(currentMoveSinceCatalystPercent) - currentNormalWindowMove);
  const hiddenMovePercent = Math.max(0, currentNormalWindowMove - Math.abs(currentMoveSinceCatalystPercent));
  const catalystQuality = Math.min(1, catalystScore / 35);
  const dailyMoveMultiple = baselineAvgDailyMovePercent
    ? currentAvgDailyMovePercent / Math.max(0.01, baselineAvgDailyMovePercent)
    : null;
  const insideNormalRange = dailyMoveMultiple == null
    ? Math.abs(currentMoveSinceCatalystPercent) <= currentNormalWindowMove
    : dailyMoveMultiple <= 1.25 && Math.abs(currentMoveSinceCatalystPercent) <= currentNormalWindowMove * 1.5;
  const materialityPercent = materiality.contractToMarketCapPercent;
  const reactedButMaterial =
    !insideNormalRange &&
    materialityPercent != null &&
    materiality.confidence !== "low" &&
    materialityPercent > Math.abs(currentMoveSinceCatalystPercent) * 1.35;
  const score = insideNormalRange
    ? 10 + catalystQuality * 20 + Math.min(8, hiddenMovePercent)
    : reactedButMaterial
      ? Math.max(8, 9 + catalystQuality * 10 + Math.min(10, materialityPercent / 2) - excessMovePercent * 0.8)
      : Math.max(0, 8 + catalystQuality * 6 - excessMovePercent * 1.8);
  const rawVerdict: DiscoveryLag["verdict"] = insideNormalRange
    ? "hidden"
    : reactedButMaterial
      ? "reacted_still_interesting"
      : "reacted";
  const verdict: DiscoveryLag["verdict"] =
    rawVerdict === "hidden" && postEventMovePercent < -5 ? "declined" : rawVerdict;
  const baselineText = baselineAvgDailyMovePercent == null
    ? "normal range estimated at 2.00%/day because pre-catalyst history is thin"
    : `normal range ${round(baselineAvgDailyMovePercent)}%/day`;
  const currentDays = Math.max(1, Math.ceil((latest.time - start.time) / 86400));

  return {
    score: round(score),
    catalystDate: catalyst.publishedAt,
    daysSinceCatalyst: Math.max(0, Math.floor((Date.now() / 1000 - catalyst.publishedAt) / 86400)),
    eventWindowDays: Math.max(1, Math.ceil((end.time - start.time) / 86400)),
    benchmarkWindowDays: Math.max(0, baselineCandles.length - 1),
    postEventMovePercent: round(postEventMovePercent),
    postEventAvgDailyMovePercent: round(postEventAvgDailyMovePercent),
    currentMoveSinceCatalystPercent: round(currentMoveSinceCatalystPercent),
    currentAvgDailyMovePercent: round(currentAvgDailyMovePercent),
    baselineAvgDailyMovePercent: baselineAvgDailyMovePercent == null ? null : round(baselineAvgDailyMovePercent),
    excessMovePercent: round(excessMovePercent),
    hiddenMovePercent: round(hiddenMovePercent),
    verdict,
    explanation: verdict === "declined"
      ? `Price fell ${round(Math.abs(currentMoveSinceCatalystPercent))}% since catalyst over ${currentDays} days despite positive news.`
      : verdict === "hidden"
        ? `Lag still present: since the catalyst, price is ${round(currentMoveSinceCatalystPercent)}% over ${currentDays} days, near ${baselineText}.`
        : verdict === "reacted_still_interesting"
          ? `Stock reacted ${round(currentMoveSinceCatalystPercent)}% since catalyst, but extracted value is still ${round(materialityPercent ?? 0)}% of market cap.`
          : `Catalyst appears repriced: price is ${round(currentMoveSinceCatalystPercent)}% since the catalyst over ${currentDays} days.`
  };
}

function emptyLag(verdict: DiscoveryLag["verdict"], explanation: string): DiscoveryLag {
  return {
    score: 0,
    catalystDate: null,
    daysSinceCatalyst: null,
    eventWindowDays: 14,
    benchmarkWindowDays: 30,
    postEventMovePercent: null,
    postEventAvgDailyMovePercent: null,
    currentMoveSinceCatalystPercent: null,
    currentAvgDailyMovePercent: null,
    baselineAvgDailyMovePercent: null,
    excessMovePercent: null,
    hiddenMovePercent: null,
    verdict,
    explanation
  };
}

function averageAbsDailyMove(candles: Candle[]): number {
  const moves: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (previous.close === 0) continue;
    moves.push(Math.abs((current.close - previous.close) / previous.close) * 100);
  }
  return moves.length === 0 ? 0 : sum(moves) / moves.length;
}

function sourceScore(domain: string): number {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  if (normalized.endsWith(".gov") || normalized.endsWith(".mil") || normalized.includes("defense.gov")) return 8;
  if (officialMarketDomains.some((suffix) => normalized.endsWith(suffix))) return 7;
  if (majorNewsDomains.some((suffix) => normalized.endsWith(suffix))) return 5;
  if (defenseTradeDomains.some((suffix) => normalized.endsWith(suffix))) return 4;
  if (normalized.includes("investor") || normalized.includes("ir.")) return 4;
  return 2;
}

function riskFlagsFor({
  evidence,
  marketCap,
  volume,
  priceChange1mo,
  exchange
}: {
  evidence: DiscoveryEvidence[];
  marketCap: number | null;
  volume: number | null;
  priceChange1mo: number | null;
  exchange: string | null | undefined;
}): string[] {
  const flags = new Set<string>();
  if (evidence.some((item) => item.riskTerms.length > 0)) flags.add("Risk language in evidence");
  if (marketCap != null && marketCap < 100_000_000) flags.add("Microcap");
  else if (marketCap != null && marketCap < 500_000_000) flags.add("Small cap");
  if (volume != null && volume < 100_000) flags.add("Thin daily volume");
  if (priceChange1mo != null && priceChange1mo > 0.8) flags.add("Already moved hard in 1mo");
  if (exchange && /otc|pink/i.test(exchange)) flags.add("OTC listing");
  return Array.from(flags);
}

function tradabilityFlagsFor(exchange: string | null | undefined, volume: number | null, marketCap: number | null): string[] {
  const flags = new Set<string>();
  const value = exchange ?? "";
  if (/nasdaq|nyse|xetra|frankfurt|lse|euronext|hong kong|australian/i.test(value)) {
    flags.add("Likely broker-accessible");
  } else {
    flags.add("Verify broker access");
  }
  if (volume != null && volume >= 500_000) flags.add("Healthy volume");
  if (marketCap != null && marketCap >= 1_000_000_000) flags.add("Institutional size");
  return Array.from(flags);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeDiscoveryScore(rawScore: number): number {
  return Math.min(100, 100 * (1 - Math.exp(-rawScore / 50)));
}

const officialMarketDomains = ["sec.gov", "asx.com.au", "londonstockexchange.com", "deutsche-boerse.com"];
const majorNewsDomains = ["reuters.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "axios.com"];
const defenseTradeDomains = [
  "defensenews.com",
  "breakingdefense.com",
  "twz.com",
  "janes.com",
  "armyrecognition.com",
  "navalnews.com",
  "defence-blog.com",
  "esut.de"
];
