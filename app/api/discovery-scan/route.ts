import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverySectors, getDiscoverySector } from "@/lib/discovery-sectors";
import { detectNegativeArticles, fetchCompanySectorEvidence, fetchSectorArticles, resolveArticleCandidates } from "@/lib/discovery-sources";
import { groupResolvedCandidates, scoreDiscoveryResult } from "@/lib/discovery-scoring";
import { fetchHistory, fetchQuoteDetails } from "@/lib/market";
import type { DiscoveryScanResponse } from "@/lib/types";

const scanSchema = z.object({
  sector: z.string().default("defense-drone-systems"),
  debug: z.boolean().optional().default(false)
});

export async function POST(request: Request) {
  const parsed = scanSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const scannedAt = Math.floor(Date.now() / 1000);
  const sector = getDiscoverySector(parsed.data.sector);
  if (!sector) return NextResponse.json({ error: "Unknown sector" }, { status: 400 });

  try {
    const articles = await fetchSectorArticles(sector);
    const resolved = await resolveArticleCandidates(articles, sector);
    const grouped = await enrichCandidateGroups(groupResolvedCandidates(resolved).slice(0, 35), sector);
    const tickers = grouped.map((candidate) => candidate.ticker);
    const details = await fetchQuoteDetails(tickers);

    const histories = await Promise.all(
      grouped.map(async (candidate) => [candidate.ticker, await fetchHistory(candidate.ticker, "6mo")] as const)
    );
    const historyByTicker = Object.fromEntries(histories);

    const results = dedupeDiscoveryResults(
      grouped
      .map((candidate) => scoreDiscoveryResult(candidate, details[candidate.ticker], historyByTicker[candidate.ticker] ?? []))
      .filter((result): result is NonNullable<typeof result> => result != null)
      .sort((a, b) => b.discoveryScore - a.discoveryScore)
    )
      .slice(0, 12);

    await Promise.all(results.map(async (result) => {
      result.badNews = await detectNegativeArticles(result.ticker, result.company);
    }));

    const response: DiscoveryScanResponse = {
      sector: parsed.data.sector,
      sectorName: sector.name,
      scannedAt,
      sources: ["GDELT DOC API", "Google News RSS", "Yahoo Finance search/quotes/history"],
      results,
      debug: parsed.data.debug
        ? {
            articles: articles.length,
            resolved: resolved.length,
            grouped: grouped.length,
            sampleTitles: articles.slice(0, 5).map((article) => article.title),
            sampleTickers: grouped.slice(0, 10).map((candidate) => candidate.ticker)
          }
        : undefined
    };

    return NextResponse.json(response);
  } catch {
    const response: DiscoveryScanResponse = {
      sector: parsed.data.sector,
      sectorName: sector.name,
      scannedAt,
      sources: ["GDELT DOC API", "Google News RSS", "Yahoo Finance search/quotes/history"],
      results: [],
      error: "Discovery scan failed. Try again later."
    };
    return NextResponse.json(response, { status: 502 });
  }
}

function dedupeDiscoveryResults<T extends { ticker: string; company: string; exchange: string | null; discoveryScore: number }>(
  results: T[]
): T[] {
  const byCompany = new Map<string, T>();
  for (const result of results) {
    const key = normalizeCompany(result.company);
    const current = byCompany.get(key);
    if (!current || listingRank(result) > listingRank(current)) {
      byCompany.set(key, result);
    }
  }

  return Array.from(byCompany.values()).sort((a, b) => b.discoveryScore - a.discoveryScore);
}

function listingRank(result: { ticker: string; exchange: string | null; discoveryScore: number }): number {
  const exchange = result.exchange ?? "";
  let score = result.discoveryScore;
  if (/nyse|nasdaq/i.test(exchange)) score += 10;
  if (!result.ticker.includes(".") && !/^\d/.test(result.ticker)) score += 4;
  if (/london|milan|frankfurt|xetra|euronext|hong kong|australian/i.test(exchange)) score += 2;
  return score;
}

function normalizeCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|company|co|holdings|holding|technologies|technology|tech|limited|ltd|plc|ag|sa|nv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function enrichCandidateGroups<T extends { ticker: string; company: string; articles: Array<{ url: string }> }>(
  groups: T[],
  sector: NonNullable<ReturnType<typeof getDiscoverySector>>
): Promise<T[]> {
  const enriched = await mapInBatches(groups, 3, async (group) => {
    const extraArticles = await fetchCompanySectorEvidence(group.company, group.ticker, sector);
    const seen = new Set(group.articles.map((article) => article.url));
    return {
      ...group,
      articles: [
        ...group.articles,
        ...extraArticles.filter((article) => {
          if (seen.has(article.url)) return false;
          seen.add(article.url);
          return true;
        })
      ].slice(0, 8)
    };
  });
  return enriched;
}


async function mapInBatches<T, R>(items: T[], batchSize: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    results.push(...(await Promise.all(items.slice(index, index + batchSize).map(mapper))));
  }
  return results;
}
