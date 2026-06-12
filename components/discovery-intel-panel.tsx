import { fmtAbs, fmtSignedPct } from "@/lib/format";
import type { DiscoveryContext } from "@/lib/types";

function fmt(n: number | null, suffix = ""): string {
  return n == null ? "—" : `${fmtAbs(n)}${suffix}`;
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e12) return `$${fmtAbs(n / 1e12)}T`;
  if (n >= 1e9) return `$${fmtAbs(n / 1e9)}B`;
  if (n >= 1e6) return `$${fmtAbs(n / 1e6)}M`;
  return `$${fmtAbs(n)}`;
}

function lagLabel(verdict: DiscoveryContext["lagVerdict"]): string {
  if (verdict === "hidden") return "Muted — upside likely not priced in";
  if (verdict === "reacted_still_interesting") return "Moved but catalyst still material";
  if (verdict === "reacted") return "Already repriced";
  if (verdict === "declined") return "Stock declined after news";
  if (verdict === "too_early") return "Too early to judge";
  if (verdict === "stale") return "Stale — >6 months old";
  return "Unknown";
}

function lagClass(verdict: DiscoveryContext["lagVerdict"]): string {
  if (verdict === "hidden") return "gain";
  if (verdict === "declined") return "loss";
  if (verdict === "reacted") return "neutral";
  if (verdict === "stale") return "muted";
  return "muted";
}

function signClass(v: number | null): string {
  if (v == null) return "muted";
  return v > 0 ? "gain" : v < 0 ? "loss" : "neutral";
}

export function DiscoveryIntelPanel({ ctx }: { ctx: DiscoveryContext }) {
  const scanDate = new Date(ctx.scannedAt * 1000).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric"
  });
  const catalystDate = ctx.catalystDate
    ? new Date(ctx.catalystDate * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const hasImpact = ctx.contractToMarketCapPercent != null
    || ctx.contractToRevenuePercent != null
    || ctx.contractToNetIncomePercent != null;

  return (
    <section className="discovery-intel">
      <div className="discovery-intel-header">
        <p className="section-label">Discovery Intelligence</p>
        <p className="muted discovery-intel-meta">{ctx.sectorName} · scanned {scanDate}</p>
      </div>

      <div className="discovery-intel-scores">
        <div className="discovery-intel-score-item">
          <p className="discovery-intel-score-val">{Math.round(ctx.discoveryScore)}/100</p>
          <p className="muted">overall score</p>
        </div>
        <div className="discovery-intel-score-item">
          <p className="discovery-intel-score-val">{Math.round(ctx.catalystScore)}/100</p>
          <p className="muted">catalyst</p>
        </div>
        <div className="discovery-intel-score-item">
          <p className={`discovery-intel-score-val ${lagClass(ctx.lagVerdict)}`}>{Math.round(ctx.lagScore)}/100</p>
          <p className="muted">lag</p>
        </div>
        <div className="discovery-intel-score-item">
          <p className={`discovery-intel-score-val ${ctx.riskScore > 0 ? "loss" : ""}`}>{Math.round(ctx.riskScore)}/100</p>
          <p className="muted">risk</p>
        </div>
      </div>

      <div className="discovery-intel-block">
        <p className="discovery-intel-block-label">Contract impact on company</p>
        {ctx.contractValue != null || ctx.contractValueLabel != null ? (
          <p className="discovery-intel-contract">
            {ctx.contractValueLabel ?? fmtMoney(ctx.contractValue)}
          </p>
        ) : null}
        {hasImpact ? (
          <div className="discovery-intel-ratios">
            {ctx.contractToMarketCapPercent != null && (
              <div className="discovery-intel-ratio">
                <p className="discovery-intel-ratio-val">{fmt(ctx.contractToMarketCapPercent, "%")}</p>
                <p className="muted">of market cap</p>
                <p className="muted discovery-intel-ratio-abs">{fmtMoney(ctx.marketCap)}</p>
              </div>
            )}
            {ctx.contractToRevenuePercent != null && (
              <div className="discovery-intel-ratio">
                <p className="discovery-intel-ratio-val">{fmt(ctx.contractToRevenuePercent, "%")}</p>
                <p className="muted">of revenue</p>
                <p className="muted discovery-intel-ratio-abs">{fmtMoney(ctx.trailingRevenue)}</p>
              </div>
            )}
            {ctx.contractToNetIncomePercent != null && (
              <div className="discovery-intel-ratio">
                <p className="discovery-intel-ratio-val">{fmt(ctx.contractToNetIncomePercent, "%")}</p>
                <p className="muted">of net income</p>
              </div>
            )}
          </div>
        ) : (
          <p className="muted">Company financials unavailable — impact ratio not calculated.</p>
        )}
      </div>

      <div className="discovery-intel-block">
        <p className="discovery-intel-block-label">Price reaction to catalyst</p>
        {catalystDate && (
          <p className="muted discovery-intel-catalyst-date">Catalyst date: {catalystDate}{ctx.daysSinceCatalyst != null ? ` · ${ctx.daysSinceCatalyst}d ago` : ""}</p>
        )}
        <div className="discovery-intel-reaction">
          <div className="discovery-intel-ratio">
            <p className={`discovery-intel-reaction-val ${signClass(ctx.postEventMovePercent)}`}>
              {ctx.postEventMovePercent != null ? fmtSignedPct(ctx.postEventMovePercent) : "—"}
            </p>
            <p className="muted">first 10 trading days</p>
          </div>
          <div className="discovery-intel-ratio">
            <p className={`discovery-intel-reaction-val ${signClass(ctx.currentMoveSinceCatalystPercent)}`}>
              {ctx.currentMoveSinceCatalystPercent != null ? fmtSignedPct(ctx.currentMoveSinceCatalystPercent) : "—"}
            </p>
            <p className="muted">total since catalyst</p>
          </div>
          <div className="discovery-intel-ratio discovery-intel-verdict-card">
            <p className={`discovery-intel-verdict-inline ${lagClass(ctx.lagVerdict)}`}>{lagLabel(ctx.lagVerdict)}</p>
            <p className="muted">assessment</p>
          </div>
        </div>
      </div>

      {ctx.topEvidence.length > 0 && (
        <div className="discovery-intel-block">
          <p className="discovery-intel-block-label">Evidence ({ctx.topEvidence.length} article{ctx.topEvidence.length !== 1 ? "s" : ""})</p>
          <ul className="discovery-intel-evidence">
            {ctx.topEvidence.map((e) => (
              <li key={e.url} className="discovery-intel-evidence-item">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="discovery-intel-evidence-link">
                  {e.title}
                </a>
                <span className="muted">
                  {e.domain}
                  {e.publishedAt ? ` · ${new Date(e.publishedAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ctx.riskFlags.length > 0 && (
        <div className="discovery-intel-block">
          <p className="discovery-intel-block-label">Risk flags</p>
          <div className="discovery-intel-flags">
            {ctx.riskFlags.map((flag) => (
              <span className="discovery-flag risk" key={flag}>{flag}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
