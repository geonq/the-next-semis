import { z } from "zod";

// Module-level CIK map cache (survives warm requests in dev; cold-starts refetch, which is fine)
let _cikMap: Map<string, number> | null = null;
let _cikMapFetchedAt = 0;

const tickerCikSchema = z.record(
  z.object({ cik_str: z.number(), ticker: z.string(), title: z.string() })
);

async function getCikMap(): Promise<Map<string, number>> {
  if (_cikMap && Date.now() - _cikMapFetchedAt < 24 * 60 * 60 * 1000) return _cikMap;
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "user-agent": "TheNextSemis/1.0 (research-tool)" },
      next: { revalidate: 86400 }
    });
    if (!res.ok) return _cikMap ?? new Map();
    const parsed = tickerCikSchema.safeParse(await res.json());
    if (!parsed.success) return _cikMap ?? new Map();
    const map = new Map<string, number>();
    for (const entry of Object.values(parsed.data)) {
      map.set(entry.ticker.toUpperCase(), entry.cik_str);
    }
    _cikMap = map;
    _cikMapFetchedAt = Date.now();
    return map;
  } catch {
    return _cikMap ?? new Map();
  }
}

const conceptSchema = z.object({
  units: z.object({
    USD: z.array(
      z.object({
        end: z.string(),
        val: z.number(),
        form: z.string().optional(),
        fp: z.string().optional(),
        filed: z.string().optional()
      })
    )
  })
});

async function fetchConcept(cik: number, concept: string): Promise<number | null> {
  const paddedCik = String(cik).padStart(10, "0");
  try {
    const res = await fetch(
      `https://data.sec.gov/api/xbrl/companyconcept/CIK${paddedCik}/us-gaap/${concept}.json`,
      { headers: { "user-agent": "TheNextSemis/1.0 (research-tool)" }, next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const parsed = conceptSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    // Most recent 10-K annual filing value
    const annual = parsed.data.units.USD
      .filter((r) => r.form === "10-K" && r.fp === "FY")
      .sort((a, b) => b.end.localeCompare(a.end))[0];
    return annual?.val ?? null;
  } catch {
    return null;
  }
}

const REVENUE_CONCEPTS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
  "RevenueFromContractWithCustomerIncludingAssessedTax"
];

export async function fetchEdgarFinancials(
  ticker: string
): Promise<{ revenue: number | null; netIncome: number | null }> {
  const empty = { revenue: null, netIncome: null };
  // EDGAR only covers US-listed companies (no exchange suffix)
  if (ticker.includes(".") || ticker.includes("-")) return empty;

  const cikMap = await getCikMap();
  const cik = cikMap.get(ticker.toUpperCase());
  if (!cik) return empty;

  let revenue: number | null = null;
  for (const concept of REVENUE_CONCEPTS) {
    revenue = await fetchConcept(cik, concept);
    if (revenue != null) break;
  }

  const netIncome = await fetchConcept(cik, "NetIncomeLoss");
  return { revenue, netIncome };
}
