"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { discoverySectors } from "@/lib/discovery-sectors";
import { fmtAbs, fmtSignedPct, signClass } from "@/lib/format";
import type { DiscoveryEvidence, DiscoveryNewsRef, DiscoveryResult, DiscoveryScanResponse } from "@/lib/types";

export function SectorDiscovery() {
  const router = useRouter();
  const [scan, setScan] = useState<DiscoveryScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sector, setSector] = useState("defense-drone-systems");
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [addMessages, setAddMessages] = useState<Record<string, string>>({});
  const scanTime = scan ? new Date(scan.scannedAt * 1000).toLocaleString() : null;

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("discovery_scan_last");
      if (!cached) return;
      const data = JSON.parse(cached) as DiscoveryScanResponse;
      setScan(data);
      setSector(data.sector);
      setSelected(
        Object.fromEntries(data.results.map((r) => [r.ticker, new Set(r.evidence.map((item) => item.url))]))
      );
    } catch {}
  }, []);

  async function runScan() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/discovery-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector })
      });
      const data = (await res.json()) as DiscoveryScanResponse;
      if (!res.ok) throw new Error(data.error ?? "Scan failed.");
      sessionStorage.setItem("discovery_scan_last", JSON.stringify(data));
      setScan(data);
      setSelected(
        Object.fromEntries(data.results.map((result) => [result.ticker, new Set(result.evidence.map((item) => item.url))]))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setLoading(false);
    }
  }

  function toggleEvidence(ticker: string, url: string) {
    setSelected((current) => {
      const next = new Set(current[ticker] ?? []);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return { ...current, [ticker]: next };
    });
  }

  async function addToResearch(result: DiscoveryResult) {
    setAdding(result.ticker);
    setError("");
    try {
      const watchlistRes = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: result.ticker,
          company: result.company,
          assetType: "equity",
          theme: scan?.sectorName ?? "Sector Discovery",
          conditions: [
            `Discovery score ${formatScore(result.discoveryScore)} from ${result.evidence.length} evidence item(s).`,
            `Lag check: ${result.lag.explanation}`,
            ...result.riskFlags.map((flag) => `Review risk: ${flag}`)
          ],
          conviction: "draft",
          status: "watching",
          discoveryContext: {
            sectorName: scan?.sectorName ?? "Sector Discovery",
            scannedAt: scan?.scannedAt ?? Math.floor(Date.now() / 1000),
            discoveryScore: result.discoveryScore,
            catalystScore: result.catalystScore,
            lagScore: result.lagScore,
            riskScore: result.riskScore,
            contractValue: result.materiality.contractValue,
            contractValueLabel: result.materiality.contractValueLabel,
            contractToMarketCapPercent: result.materiality.contractToMarketCapPercent,
            contractToRevenuePercent: result.materiality.contractToRevenuePercent,
            contractToNetIncomePercent: result.materiality.contractToNetIncomePercent,
            marketCap: result.marketCap,
            trailingRevenue: result.trailingRevenue,
            lagVerdict: result.lag.verdict,
            catalystDate: result.lag.catalystDate,
            daysSinceCatalyst: result.lag.daysSinceCatalyst,
            postEventMovePercent: result.lag.postEventMovePercent,
            currentMoveSinceCatalystPercent: result.lag.currentMoveSinceCatalystPercent,
            riskFlags: result.riskFlags,
            topEvidence: result.evidence.slice(0, 5).map((e) => ({
              title: e.title,
              url: e.url,
              domain: e.domain,
              publishedAt: e.publishedAt
            }))
          }
        })
      });

      if (!watchlistRes.ok && watchlistRes.status !== 409) {
        const data = await watchlistRes.json();
        throw new Error(data.error ?? "Failed to add ticker.");
      }

      const selectedUrls = selected[result.ticker] ?? new Set<string>();
      const toSave = result.evidence.filter((item) => selectedUrls.has(item.url));
      // Sequential saves — concurrent POSTs race on the same KV read-modify-write
      const saveResults: boolean[] = [];
      for (const item of toSave) {
        const res = await fetch("/api/saved-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "article",
            url: item.url,
            title: item.title,
            note: evidenceNote(result, item),
            theme: scan?.sectorName ?? "Sector Discovery",
            tickers: [result.ticker]
          })
        });
        saveResults.push(res.ok);
      }
      const saved = saveResults.filter(Boolean).length;
      const failed = saveResults.length - saved;

      router.refresh();
      setAddMessages((prev) => ({
        ...prev,
        [result.ticker]: failed > 0
          ? `${result.ticker} added · ${saved} saved · ${failed} failed to save`
          : `${result.ticker} added · ${saved} article(s) saved`
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to research.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <section className="discovery-section">
      <div className="discovery-header">
        <div>
          <p className="section-label discovery-title">Sector Discovery</p>
          <p className="muted discovery-copy">
            Live scan for public companies with catalyst evidence, market-cap materiality, post-catalyst price reaction, and explicit risk flags.
          </p>
        </div>
        <div className="discovery-controls">
          <select className="add-input add-select discovery-sector" value={sector} onChange={(e) => setSector(e.target.value)}>
            {discoverySectors.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <button className="add-btn" onClick={runScan} disabled={loading} type="button">
            {loading ? "Scanning..." : "Scan"}
          </button>
        </div>
      </div>

      {error ? <p className="loss discovery-status">{error}</p> : null}
      {scanTime ? (
        <p className="muted discovery-status">
          Scanned {scanTime} via {scan?.sources.join(", ")}.
        </p>
      ) : null}

      {scan && scan.results.length === 0 ? (
        <p className="muted discovery-empty">No candidates found from the live sources. Try again later.</p>
      ) : null}

      {scan && scan.results.length > 0 ? (
        <div className="discovery-grid">
          {scan.results.map((result) => (
            <DiscoveryCard
              key={result.ticker}
              result={result}
              selected={selected[result.ticker] ?? new Set<string>()}
              adding={adding === result.ticker}
              addMessage={addMessages[result.ticker]}
              onToggleEvidence={(url) => toggleEvidence(result.ticker, url)}
              onAdd={() => addToResearch(result)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function exchangeLabel(exchange: string | null): string {
  if (!exchange) return "exchange unknown";
  if (/nyse|nasdaq|nysearca|amex/i.test(exchange)) return "US listed";
  if (/toronto|tsx/i.test(exchange)) return "Canadian listed";
  if (/london/i.test(exchange)) return "London listed";
  if (/frankfurt|xetra/i.test(exchange)) return "German listed";
  if (/euronext/i.test(exchange)) return "Euronext listed";
  if (/milan/i.test(exchange)) return "Italian listed";
  if (/australian/i.test(exchange)) return "Australian listed";
  if (/hong kong/i.test(exchange)) return "HK listed";
  if (/otc|pink/i.test(exchange)) return "OTC — verify availability";
  return "verify availability";
}

function scoreDriver(result: DiscoveryResult): string {
  if (result.materiality.confidence === "low" && result.catalystScore > 30) return "catalyst-driven · materiality unconfirmed";
  if (result.catalystScore > 40) return "strong catalyst signal";
  if (result.materiality.score > 10) return "material catalyst";
  return "early signal";
}

function DiscoveryCard({
  result,
  selected,
  adding,
  addMessage,
  onToggleEvidence,
  onAdd
}: {
  result: DiscoveryResult;
  selected: Set<string>;
  adding: boolean;
  addMessage?: string;
  onToggleEvidence: (url: string) => void;
  onAdd: () => void;
}) {
  const strongestTerms = useMemo(() => {
    return Array.from(new Set(result.evidence.flatMap((item) => item.matchedTerms))).slice(0, 4);
  }, [result.evidence]);

  return (
    <article className="discovery-card">
      <div className="card-top">
        <div>
          <p className="ticker card-ticker">{result.ticker}</p>
          <p className="subtle">{result.company}</p>
        </div>
        <div className="card-price">
          <p className="ticker tabular">{formatScore(result.discoveryScore)}</p>
          <p className="subtle">score</p>
          <p className="muted discovery-score-driver">{scoreDriver(result)}</p>
        </div>
      </div>

      <p className="meta-line">
        <span className="meta-chip meta-chip-primary">{result.exchange ?? "Unknown exchange"}</span>
        <span className="muted discovery-broker-label">{exchangeLabel(result.exchange)}</span>
        <span className={signClass(result.priceChange5d)}>{fmtSignedPct(toPct(result.priceChange5d))} 5d</span>
        <span className={signClass(result.priceChange1mo)}>{fmtSignedPct(toPct(result.priceChange1mo))} 1mo</span>
      </p>

      <div className="discovery-metrics">
        <Metric label="Catalyst" value={catalystLevel(result.catalystScore)} context={`${result.evidence.length} article(s) · ${uniqueTermCount(result)} term(s)`} hint="keyword pattern strength" />
        <Metric label="Materiality" value={materialityLevel(result.materiality.score)} context={materialityContext(result)} hint="contract vs company size" />
        <Metric label="Lag" value={formatScore(result.lag.score)} context={lagVerdict(result)} hint="100 = unharvested · 0 = priced in" />
        <Metric
          label="Risk"
          value={riskLevel(result.riskScore)}
          context={result.riskFlags.length > 0 ? `${result.riskFlags.length} flag(s)` : "No risk terms"}
          tone={result.riskScore > 0 ? "loss" : "neutral"}
          hint={result.riskScore > 0 ? "more flags = higher risk" : undefined}
        />
      </div>

      <div className="lag-panel">
        <div>
          <span>Post-catalyst reaction</span>
          <strong className={
            result.lag.verdict === "hidden" ? "gain"
            : result.lag.verdict === "declined" ? "loss"
            : result.lag.verdict === "stale" ? "muted"
            : result.lag.verdict === "reacted" ? "neutral"
            : "muted"
          }>
            {lagVerdict(result)}
          </strong>
        </div>
        <p className="muted">{result.lag.explanation}</p>
        <LagDataLines result={result} />
      </div>

      <div className="materiality-panel">
        <div>
          <span>Materiality</span>
          <strong>{materialityLabel(result)}</strong>
        </div>
        <p className="muted">{materialityDataLine(result)}</p>
      </div>

      {strongestTerms.length > 0 ? (
        <div className="discovery-tags">
          <span className="muted discovery-tags-label">Keywords detected:</span>
          {strongestTerms.map((term) => (
            <span className="discovery-tag" key={term}>
              {term}
            </span>
          ))}
        </div>
      ) : null}

      <div className="discovery-flags">
        {result.tradabilityFlags.map((flag) => (
          <span className="discovery-flag" key={flag}>
            {flag}
          </span>
        ))}
        {result.riskFlags.map((flag) => (
          <span className="discovery-flag risk" key={flag}>
            {flag}
          </span>
        ))}
      </div>

      <div className="discovery-evidence-list">
        {result.evidence.map((item) => (
          <label className="discovery-evidence" key={item.url}>
            <input
              checked={selected.has(item.url)}
              onChange={() => onToggleEvidence(item.url)}
              type="checkbox"
            />
            <span>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              <small>
                {item.domain}
                {item.publishedAt ? ` · ${new Date(item.publishedAt * 1000).toLocaleDateString()}` : ""}
              </small>
            </span>
          </label>
        ))}
      </div>

      {result.badNews && result.badNews.length > 0 ? (
        <details className="discovery-bad-news">
          <summary>Negative signals ({result.badNews.length})</summary>
          <div className="discovery-evidence-list">
            {result.badNews.map((item) => (
              <div className="discovery-evidence" key={item.url}>
                <span>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                  <small>{item.domain}{item.publishedAt ? ` · ${new Date(item.publishedAt * 1000).toLocaleDateString()}` : ""}</small>
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <button className="add-btn discovery-add" onClick={onAdd} disabled={adding} type="button">
        {adding ? "Adding..." : "Add to research"}
      </button>
      {addMessage ? <p className="muted discovery-add-msg">{addMessage}</p> : null}
    </article>
  );
}

function Metric({
  label,
  value,
  context,
  hint,
  tone = "neutral"
}: {
  label: string;
  value: string;
  context: string;
  hint?: string;
  tone?: "neutral" | "loss";
}) {
  return (
    <div>
      <span className="muted">{label}</span>
      <strong className={tone}>{value}</strong>
      <small>{context}</small>
      {hint ? <small className="muted">{hint}</small> : null}
    </div>
  );
}

function catalystLevel(score: number): string {
  if (score > 60) return "Very strong";
  if (score > 35) return "Strong";
  if (score > 15) return "Moderate";
  return "Weak";
}

function materialityLevel(score: number): string {
  if (score > 15) return "Very high";
  if (score > 8) return "High";
  if (score > 3) return "Moderate";
  return "Low";
}

function riskLevel(score: number): string {
  if (score > 10) return "High";
  if (score > 4) return "Moderate";
  if (score > 0) return "Low";
  return "None";
}

function uniqueTermCount(result: DiscoveryResult): number {
  return new Set(result.evidence.flatMap((item) => item.matchedTerms)).size;
}

function toPct(value: number | null): number | null {
  return value == null ? null : value * 100;
}

function formatScore(value: number): string {
  return `${Math.round(value)}/100`;
}

function formatMoneyCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function LagDataLines({ result }: { result: DiscoveryResult }) {
  const lines: React.ReactNode[] = [];

  if (result.lag.catalystDate) {
    lines.push(
      <li key="date" className="lag-data-line">
        Catalyst date: {new Date(result.lag.catalystDate * 1000).toLocaleDateString()}
      </li>
    );
  }
  if (result.lag.postEventMovePercent != null) {
    lines.push(
      <li key="event" className="lag-data-line">
        First {result.lag.eventWindowDays}d:{" "}
        <span className={signClass(result.lag.postEventMovePercent)}>
          {fmtSignedPct(result.lag.postEventMovePercent)}
        </span>
      </li>
    );
  }
  if (result.lag.currentMoveSinceCatalystPercent != null && result.lag.daysSinceCatalyst != null) {
    lines.push(
      <li key="total" className="lag-data-line">
        Total since catalyst ({result.lag.daysSinceCatalyst}d):{" "}
        <span className={signClass(result.lag.currentMoveSinceCatalystPercent)}>
          {fmtSignedPct(result.lag.currentMoveSinceCatalystPercent)}
        </span>
      </li>
    );
  }
  if (result.lag.postEventAvgDailyMovePercent != null) {
    const current = result.lag.currentAvgDailyMovePercent ?? result.lag.postEventAvgDailyMovePercent;
    const baseline = result.lag.baselineAvgDailyMovePercent;
    lines.push(
      <li key="avg" className="lag-data-line">
        Avg daily move: {fmtAbs(current)}%/d
        {baseline != null ? <span className="muted"> vs {fmtAbs(baseline)}%/d baseline</span> : null}
      </li>
    );
  }

  if (lines.length === 0) return <p className="muted">No reaction data available.</p>;
  return <ul className="lag-data-lines">{lines}</ul>;
}

function materialityDataLine(result: DiscoveryResult): string {
  const parts: string[] = [];
  if (result.materiality.contractValue != null) parts.push(formatMoneyCompact(result.materiality.contractValue));
  if (result.materiality.confidence) parts.push(`${result.materiality.confidence} confidence`);
  if (result.marketCap != null) parts.push(`cap ${formatMoneyCompact(result.marketCap)}`);
  if (result.materiality.contractToRevenuePercent != null) {
    parts.push(`${fmtAbs(result.materiality.contractToRevenuePercent)}% revenue`);
  }
  if (result.materiality.contractToNetIncomePercent != null) {
    parts.push(`${fmtAbs(result.materiality.contractToNetIncomePercent)}% income`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No value data available";
}

function lagVerdict(result: DiscoveryResult): string {
  if (result.lag.verdict === "declined") return "Declined after news";
  if (result.lag.verdict === "hidden") return "Muted reaction";
  if (result.lag.verdict === "reacted_still_interesting") return "Moved, still material";
  if (result.lag.verdict === "reacted") return "Already repriced";
  if (result.lag.verdict === "too_early") return "Too early";
  if (result.lag.verdict === "stale") return "Stale — >6mo old";
  return "No reaction data";
}

function materialityLabel(result: DiscoveryResult): string {
  if (result.materiality.contractToMarketCapPercent != null) {
    return `${fmtAbs(result.materiality.contractToMarketCapPercent)}% of market cap`;
  }
  if (result.materiality.contractValue != null) {
    return formatMoneyCompact(result.materiality.contractValue);
  }
  return "No value extracted";
}

function materialityContext(result: DiscoveryResult): string {
  const pieces = [];
  if (result.materiality.contractToMarketCapPercent != null) pieces.push(`${fmtAbs(result.materiality.contractToMarketCapPercent)}% cap`);
  if (result.materiality.contractToNetIncomePercent != null) pieces.push(`${fmtAbs(result.materiality.contractToNetIncomePercent)}% income`);
  if (pieces.length === 0 && result.materiality.contractValue != null) {
    return `${formatMoneyCompact(result.materiality.contractValue)} · cap unknown`;
  }
  return pieces.length > 0 ? pieces.join(" · ") : "no contract value found";
}

function evidenceNote(result: DiscoveryResult, item: DiscoveryEvidence): string {
  const terms = item.matchedTerms.length > 0 ? `Matched: ${item.matchedTerms.join(", ")}.` : "";
  const risks = item.riskTerms.length > 0 ? ` Risks: ${item.riskTerms.join(", ")}.` : "";
  return `Discovery candidate ${result.ticker}. Score ${formatScore(result.discoveryScore)}. Catalyst ${fmtAbs(item.catalystScore)} pts, source ${fmtAbs(item.sourceScore)} pts, risk ${fmtAbs(item.riskScore)} pts. ${result.lag.explanation} ${terms}${risks}`.trim();
}
