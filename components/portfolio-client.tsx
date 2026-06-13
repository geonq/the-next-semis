"use client";

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { fmtSignedPct, fmtSignedUsd, fmtUsd, signClass } from "@/lib/format";
import {
  enrichPositions,
  enrichRealizedPnl,
  portfolioSummary,
  realizedPnlLeaders,
  realizedPnlSummary
} from "@/lib/portfolio";
import type {
  EnrichedPosition,
  EnrichedRealizedPnlEntry,
  Position,
  QuotesByTicker,
  RealizedPnlEntry,
  WatchlistEntry
} from "@/lib/types";
import { SegmentedTabs } from "./segmented-tabs";
import { TickerAutocomplete } from "./ticker-autocomplete";
import { useLiveQuotes } from "./use-live-quotes";

export function PortfolioClient({
  positions,
  realizedPnl,
  initialQuotes,
  tickers,
  coingeckoParam,
  watchlist,
  isAdmin
}: {
  positions: Position[];
  realizedPnl: RealizedPnlEntry[];
  initialQuotes: QuotesByTicker;
  tickers: string[];
  coingeckoParam?: string;
  watchlist: WatchlistEntry[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const quotes = useLiveQuotes(initialQuotes, tickers, coingeckoParam);
  const enriched = enrichPositions(positions, quotes).sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0));
  const summary = portfolioSummary(enriched);
  const realizedEntries = enrichRealizedPnl(realizedPnl).sort((a, b) => b.closed_at.localeCompare(a.closed_at));
  const realizedSummary = realizedPnlSummary(realizedEntries);
  const biggestWinners = realizedPnlLeaders(realizedEntries, "winners");
  const biggestLosers = realizedPnlLeaders(realizedEntries, "losers");
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [editingRealizedPnl, setEditingRealizedPnl] = useState<RealizedPnlEntry | null>(null);

  async function deletePosition(ticker: string) {
    await fetch("/api/positions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker })
    });
    router.refresh();
  }

  async function deleteRealizedPnl(id: string) {
    await fetch("/api/realized-pnl", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    router.refresh();
  }

  return (
    <div className="stack-lg">
      <section>
        <div className="summary-line">
          <span className="hero-number tabular">{fmtUsd(summary.total_value)}</span>
          <div className="summary-delta">
            <span className={`tabular ${signClass(summary.day_change_dollars)}`}>
              {fmtSignedUsd(summary.day_change_dollars)}
            </span>
            <span className={`tabular ${signClass(summary.day_change_percent)}`}>
              {fmtSignedPct(summary.day_change_percent)}
            </span>
            <span className="muted">today</span>
          </div>
        </div>
      </section>

      <RealizedLeaders winners={biggestWinners} losers={biggestLosers} />

      <div className="m-pos-list">
        {enriched.map((position) => (
          <MobilePositionRow
            key={position.ticker}
            position={position}
            isAdmin={isAdmin}
            onDelete={deletePosition}
            onEdit={(ticker) => setEditingPosition(positions.find((p) => p.ticker === ticker) ?? null)}
          />
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Position</th>
              <th>Amount</th>
              <th>Avg Cost</th>
              <th>Current</th>
              <th>Value</th>
              <th>PnL $</th>
              <th>PnL %</th>
              <th>Day</th>
              {isAdmin ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {enriched.map((position) => (
              <tr key={position.ticker}>
                <td>
                  <span className="position-cell">
                    <span className="ticker">{position.ticker}</span>
                    <span className="subtle">{position.company}</span>
                  </span>
                </td>
                <td className="tabular">{position.shares.toLocaleString("en-US")}</td>
                <td className="tabular">{fmtUsd(position.average_cost_usd ?? position.average_cost)}</td>
                <td className="tabular">{fmtUsd(position.current_price)}</td>
                <td className="tabular">{fmtUsd(position.total_value)}</td>
                <td className={`tabular ${signClass(position.pnl_dollars)}`}>{fmtSignedUsd(position.pnl_dollars)}</td>
                <td className={`tabular ${signClass(position.pnl_percent)}`}>{fmtSignedPct(position.pnl_percent)}</td>
                <td className={`tabular ${signClass(position.day_change_percent)}`}>
                  {fmtSignedPct(position.day_change_percent)}
                </td>
                {isAdmin ? (
                  <td className="position-actions">
                    <button
                      className="edit-btn"
                      onClick={() => setEditingPosition(positions.find((p) => p.ticker === position.ticker) ?? null)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => deletePosition(position.ticker)}
                      type="button"
                      aria-label={`Remove ${position.ticker}`}
                    >
                      ✕
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RealizedPnlSection
        entries={realizedEntries}
        summary={realizedSummary}
        isAdmin={isAdmin}
        onEdit={(id) => setEditingRealizedPnl(realizedPnl.find((entry) => entry.id === id) ?? null)}
        onDelete={deleteRealizedPnl}
      />

      <Concentration enriched={enriched} watchlist={watchlist} positions={positions} />

      {isAdmin && editingRealizedPnl ? (
        <EditRealizedPnlForm
          entry={editingRealizedPnl}
          onCancel={() => setEditingRealizedPnl(null)}
          onSaved={() => {
            setEditingRealizedPnl(null);
            router.refresh();
          }}
        />
      ) : null}

      {isAdmin && editingPosition ? (
        <EditPositionForm
          position={editingPosition}
          onCancel={() => setEditingPosition(null)}
          onSaved={() => {
            setEditingPosition(null);
            router.refresh();
          }}
        />
      ) : null}

      {isAdmin ? <AddRealizedPnlForm onAdded={() => router.refresh()} /> : null}
      {isAdmin ? <AddPositionForm onAdded={() => router.refresh()} /> : null}
    </div>
  );
}

function MobilePositionRow({
  position,
  isAdmin,
  onDelete,
  onEdit
}: {
  position: EnrichedPosition;
  isAdmin: boolean;
  onDelete: (ticker: string) => void;
  onEdit: (ticker: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="m-pos-row">
      <button className="m-pos-summary" onClick={() => setOpen((v) => !v)} type="button">
        <span className="m-pos-ticker">{position.ticker}</span>
        <span className="m-pos-amount tabular">{position.shares.toLocaleString("en-US")}</span>
      </button>
      <div className={`m-pos-detail${open ? " open" : ""}`}>
        <div className="m-pos-detail-inner">
          <div className="m-pos-stats">
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Avg Cost</span>
              <span className="m-pos-stat-value tabular">{fmtUsd(position.average_cost_usd ?? position.average_cost)}</span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Current</span>
              <span className="m-pos-stat-value tabular">{fmtUsd(position.current_price)}</span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Value</span>
              <span className="m-pos-stat-value tabular">{fmtUsd(position.total_value)}</span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">PnL $</span>
              <span className={`m-pos-stat-value tabular ${signClass(position.pnl_dollars)}`}>
                {fmtSignedUsd(position.pnl_dollars)}
              </span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">PnL %</span>
              <span className={`m-pos-stat-value tabular ${signClass(position.pnl_percent)}`}>
                {fmtSignedPct(position.pnl_percent)}
              </span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Day</span>
              <span className={`m-pos-stat-value tabular ${signClass(position.day_change_percent)}`}>
                {fmtSignedPct(position.day_change_percent)}
              </span>
            </div>
          </div>
          {isAdmin ? (
            <div className="m-pos-actions">
              <button
                className="m-pos-edit"
                onClick={() => onEdit(position.ticker)}
                type="button"
              >
                Edit {position.ticker}
              </button>
              <button
                className="m-pos-delete"
                onClick={() => onDelete(position.ticker)}
                type="button"
              >
                Remove {position.ticker}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RealizedLeaders({
  winners,
  losers
}: {
  winners: EnrichedRealizedPnlEntry[];
  losers: EnrichedRealizedPnlEntry[];
}) {
  return (
    <section className="hairline">
      <div className="two-col">
        <RealizedLeaderList title="Biggest winners" entries={winners} emptyText="No closed winners yet." />
        <RealizedLeaderList title="Biggest losers" entries={losers} emptyText="No closed losers yet." />
      </div>
    </section>
  );
}

function RealizedLeaderList({
  title,
  entries,
  emptyText
}: {
  title: string;
  entries: EnrichedRealizedPnlEntry[];
  emptyText: string;
}) {
  return (
    <div>
      <p className="section-label">{title}</p>
      <div className="leader-list">
        {entries.map((entry) => (
          <div key={entry.id} className="leader-row">
            <span className="position-cell">
              <span className="ticker">{entry.ticker}</span>
              <span className="subtle">{entry.company}</span>
            </span>
            <span className={`tabular ${signClass(entry.realized_pnl)}`}>
              {fmtSignedUsd(entry.realized_pnl)}
            </span>
            <span className={`tabular ${signClass(entry.realized_pnl_percent)}`}>
              {fmtSignedPct(entry.realized_pnl_percent)}
            </span>
          </div>
        ))}
        {entries.length === 0 ? <p className="muted">{emptyText}</p> : null}
      </div>
    </div>
  );
}

function RealizedPnlSection({
  entries,
  summary,
  isAdmin,
  onEdit,
  onDelete
}: {
  entries: EnrichedRealizedPnlEntry[];
  summary: ReturnType<typeof realizedPnlSummary>;
  isAdmin: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="hairline">
      <div className="rpnl-header">
        <div>
          <p className="section-label">Realized PnL</p>
          <div className="rpnl-summary">
            <span className={`rpnl-total tabular ${signClass(summary.total_realized_pnl)}`}>
              {fmtSignedUsd(summary.total_realized_pnl)}
            </span>
            <span className="muted tabular">{fmtSignedPct(summary.win_rate)} win rate</span>
            <span className="muted tabular">{summary.winners}W / {summary.losers}L</span>
          </div>
        </div>
        <div className="rpnl-averages">
          <span className="tabular gain">Avg win {fmtSignedUsd(summary.average_winner)}</span>
          <span className="tabular loss">Avg loss {fmtSignedUsd(summary.average_loser)}</span>
        </div>
      </div>

      <div className="m-pos-list rpnl-mobile-list">
        {entries.map((entry) => (
          <MobileRealizedPnlRow
            key={entry.id}
            entry={entry}
            isAdmin={isAdmin}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Closed Trade</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Fees</th>
              <th>Margin</th>
              <th>RPNL $</th>
              <th>RPNL %</th>
              <th>Closed</th>
              {isAdmin ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <span className="position-cell">
                    <span className="ticker">{entry.ticker}</span>
                    <span className="subtle">{entry.company}</span>
                  </span>
                </td>
                <td>{entry.side}</td>
                <td className="tabular">{fmtQuantity(entry.quantity)}</td>
                <td className="tabular">{fmtUsd(entry.entry_price)}</td>
                <td className="tabular">{fmtUsd(entry.exit_price)}</td>
                <td className="tabular">{fmtUsd(entry.fees ?? 0)}</td>
                <td className="tabular">{marginLabel(entry)}</td>
                <td className={`tabular ${signClass(entry.realized_pnl)}`}>{fmtSignedUsd(entry.realized_pnl)}</td>
                <td className={`tabular ${signClass(entry.realized_pnl_percent)}`}>
                  {fmtSignedPct(entry.realized_pnl_percent)}
                </td>
                <td className="tabular">{entry.closed_at}</td>
                {isAdmin ? (
                  <td className="position-actions">
                    <button className="edit-btn" onClick={() => onEdit(entry.id)} type="button">
                      Edit
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => onDelete(entry.id)}
                      type="button"
                      aria-label={`Remove realized PnL entry for ${entry.ticker}`}
                    >
                      ✕
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 ? <p className="muted rpnl-empty">No realized PnL entries yet.</p> : null}
      </div>
    </section>
  );
}

function MobileRealizedPnlRow({
  entry,
  isAdmin,
  onDelete,
  onEdit
}: {
  entry: EnrichedRealizedPnlEntry;
  isAdmin: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="m-pos-row">
      <button className="m-pos-summary" onClick={() => setOpen((v) => !v)} type="button">
        <span className="m-pos-ticker">{entry.ticker}</span>
        <span className={`m-pos-amount tabular ${signClass(entry.realized_pnl)}`}>
          {fmtSignedUsd(entry.realized_pnl)}
        </span>
      </button>
      <div className={`m-pos-detail${open ? " open" : ""}`}>
        <div className="m-pos-detail-inner">
          <div className="m-pos-stats">
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Side</span>
              <span className="m-pos-stat-value">{entry.side}</span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Qty</span>
              <span className="m-pos-stat-value tabular">{fmtQuantity(entry.quantity)}</span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Entry</span>
              <span className="m-pos-stat-value tabular">{fmtUsd(entry.entry_price)}</span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Exit</span>
              <span className="m-pos-stat-value tabular">{fmtUsd(entry.exit_price)}</span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Margin</span>
              <span className="m-pos-stat-value tabular">{marginLabel(entry)}</span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">RPNL %</span>
              <span className={`m-pos-stat-value tabular ${signClass(entry.realized_pnl_percent)}`}>
                {fmtSignedPct(entry.realized_pnl_percent)}
              </span>
            </div>
            <div className="m-pos-stat">
              <span className="m-pos-stat-label">Closed</span>
              <span className="m-pos-stat-value tabular">{entry.closed_at}</span>
            </div>
          </div>
          {isAdmin ? (
            <div className="m-pos-actions">
              <button className="m-pos-edit" onClick={() => onEdit(entry.id)} type="button">
                Edit {entry.ticker}
              </button>
              <button className="m-pos-delete" onClick={() => onDelete(entry.id)} type="button">
                Remove {entry.ticker}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Concentration({
  enriched,
  watchlist,
  positions
}: {
  enriched: EnrichedPosition[];
  watchlist: WatchlistEntry[];
  positions: Position[];
}) {
  const totalValue = enriched.reduce((sum, p) => sum + (p.total_value ?? 0), 0);

  const bySector = enriched.reduce<Record<string, number>>((acc, p) => {
    const sector = p.sector || "Other";
    acc[sector] = (acc[sector] ?? 0) + (p.total_value ?? 0);
    return acc;
  }, {});
  const sectors = Object.entries(bySector).sort((a, b) => b[1] - a[1]);

  const heldTickers = new Set(positions.map((p) => p.ticker));
  const themeMap = watchlist.reduce<Record<string, { total: number; held: number }>>((acc, e) => {
    if (!acc[e.theme]) acc[e.theme] = { total: 0, held: 0 };
    acc[e.theme].total += 1;
    if (heldTickers.has(e.ticker)) acc[e.theme].held += 1;
    return acc;
  }, {});
  const themes = Object.entries(themeMap).sort((a, b) => b[1].held - a[1].held || b[1].total - a[1].total);

  if (sectors.length === 0 && themes.length === 0) return null;

  return (
    <section className="hairline">
      <div className="two-col">
        {sectors.length > 0 && (
          <div>
            <p className="section-label">Sector allocation</p>
            <div className="alloc-list">
              {sectors.map(([sector, value]) => {
                const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                return (
                  <div key={sector} className="alloc-row">
                    <span className="alloc-label">{sector}</span>
                    <div className="alloc-bar-track">
                      <div className="alloc-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="alloc-pct tabular">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {themes.length > 0 && (
          <div>
            <p className="section-label">Theme coverage</p>
            <div className="alloc-list">
              {themes.map(([theme, { total, held }]) => (
                <div key={theme} className="alloc-row">
                  <span className="alloc-label">{theme}</span>
                  <div className="alloc-bar-track">
                    <div className="alloc-bar-fill" style={{ width: `${(held / total) * 100}%` }} />
                  </div>
                  <span className={`alloc-pct tabular ${held === 0 ? "muted" : ""}`}>
                    {held}/{total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type AssetClass = "stock" | "crypto";
type PositionFormState = {
  ticker: string;
  company: string;
  assetClass: AssetClass;
  coinGeckoId: string;
  shares: string;
  average_cost: string;
  currency: string;
  entry_date: string;
  sector: string;
};

const emptyPositionForm: PositionFormState = {
  ticker: "",
  company: "",
  assetClass: "stock",
  coinGeckoId: "",
  shares: "",
  average_cost: "",
  currency: "USD",
  entry_date: "",
  sector: ""
};

function formFromPosition(position: Position): PositionFormState {
  return {
    ticker: position.ticker,
    company: position.company,
    assetClass: position.assetClass === "crypto" ? "crypto" : "stock",
    coinGeckoId: position.coinGeckoId ?? "",
    shares: String(position.shares),
    average_cost: String(position.average_cost_usd ?? position.average_cost),
    currency: position.average_cost_usd != null ? "USD" : position.currency,
    entry_date: position.entry_date ?? "",
    sector: position.sector
  };
}

function positionPayload(form: PositionFormState) {
  return {
    ticker: form.ticker,
    company: form.company,
    assetClass: form.assetClass,
    coinGeckoId: form.coinGeckoId || undefined,
    shares: parseFloat(form.shares),
    average_cost: parseFloat(form.average_cost),
    currency: form.currency,
    entry_date: form.entry_date || undefined,
    sector: form.sector
  };
}

type RealizedPnlFormState = {
  ticker: string;
  company: string;
  assetClass: "stock" | "crypto" | "perp";
  side: "long" | "short";
  quantity: string;
  entry_price: string;
  exit_price: string;
  fees: string;
  leverage: string;
  margin_mode: "isolated" | "shared";
  margin_used: string;
  currency: string;
  opened_at: string;
  closed_at: string;
  sector: string;
  note: string;
};

const emptyRealizedPnlForm: RealizedPnlFormState = {
  ticker: "",
  company: "",
  assetClass: "stock",
  side: "long",
  quantity: "",
  entry_price: "",
  exit_price: "",
  fees: "0",
  leverage: "",
  margin_mode: "isolated",
  margin_used: "",
  currency: "USD",
  opened_at: "",
  closed_at: "",
  sector: "",
  note: ""
};

function formFromRealizedPnl(entry: RealizedPnlEntry): RealizedPnlFormState {
  return {
    ticker: entry.ticker,
    company: entry.company,
    assetClass: entry.assetClass ?? "stock",
    side: entry.side,
    quantity: String(entry.quantity),
    entry_price: String(entry.entry_price),
    exit_price: String(entry.exit_price),
    fees: String(entry.fees ?? 0),
    leverage: entry.leverage != null ? String(entry.leverage) : "",
    margin_mode: entry.margin_mode ?? "isolated",
    margin_used: entry.margin_used != null ? String(entry.margin_used) : "",
    currency: entry.currency,
    opened_at: entry.opened_at ?? "",
    closed_at: entry.closed_at,
    sector: entry.sector ?? "",
    note: entry.note ?? ""
  };
}

function realizedPnlPayload(form: RealizedPnlFormState) {
  return {
    ticker: form.ticker,
    company: form.company,
    assetClass: form.assetClass,
    side: form.side,
    quantity: parseFloat(form.quantity),
    entry_price: parseFloat(form.entry_price),
    exit_price: parseFloat(form.exit_price),
    fees: form.fees ? parseFloat(form.fees) : 0,
    leverage: form.leverage ? parseFloat(form.leverage) : undefined,
    margin_mode: form.assetClass === "perp" ? form.margin_mode : undefined,
    margin_used: form.margin_used ? parseFloat(form.margin_used) : undefined,
    currency: form.currency,
    opened_at: form.opened_at || undefined,
    closed_at: form.closed_at,
    sector: form.sector || undefined,
    note: form.note || undefined
  };
}

function fmtQuantity(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 8
  });
}

function marginLabel(entry: EnrichedRealizedPnlEntry): string {
  if (entry.assetClass !== "perp") return "—";
  const mode = entry.margin_mode === "shared" ? "shared" : "isolated";
  const leverage = entry.leverage ? `${entry.leverage.toLocaleString("en-US", { maximumFractionDigits: 2 })}x` : "spot";
  return `${fmtUsd(entry.return_basis)} ${mode} / ${leverage}`;
}

function AddPositionForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<PositionFormState>(emptyPositionForm);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(positionPayload(form))
    });

    if (res.ok) {
      setForm(emptyPositionForm);
      setOpen(false);
      onAdded();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to add position.");
    }
  }

  if (!open) {
    return (
      <button className="add-btn" onClick={() => setOpen(true)} type="button">
        + Add / increase position
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <p className="section-label">New lot</p>
      <PositionFormFields form={form} setForm={setForm} />
      {error ? <p className="loss">{error}</p> : null}
      <div className="add-actions">
        <button className="add-btn" type="submit">Add</button>
        <button className="cancel-btn" onClick={() => setOpen(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}

function AddRealizedPnlForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<RealizedPnlFormState>(emptyRealizedPnlForm);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/realized-pnl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(realizedPnlPayload(form))
    });

    if (res.ok) {
      setForm(emptyRealizedPnlForm);
      setOpen(false);
      onAdded();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to add realized PnL entry.");
    }
  }

  if (!open) {
    return (
      <button className="add-btn" onClick={() => setOpen(true)} type="button">
        + Add realized PnL
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <p className="section-label">New realized PnL entry</p>
      <RealizedPnlFormFields form={form} setForm={setForm} />
      {error ? <p className="loss">{error}</p> : null}
      <div className="add-actions">
        <button className="add-btn" type="submit">Add</button>
        <button className="cancel-btn" onClick={() => setOpen(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}

function EditPositionForm({
  position,
  onSaved,
  onCancel
}: {
  position: Position;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [form, setForm] = useState<PositionFormState>(() => formFromPosition(position));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/positions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalTicker: position.ticker, ...positionPayload(form) })
    });

    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to update position.");
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <p className="section-label">Edit position</p>
      <PositionFormFields form={form} setForm={setForm} />
      {error ? <p className="loss">{error}</p> : null}
      <div className="add-actions">
        <button className="add-btn" type="submit">Save</button>
        <button className="cancel-btn" onClick={onCancel} type="button">Cancel</button>
      </div>
    </form>
  );
}

function EditRealizedPnlForm({
  entry,
  onSaved,
  onCancel
}: {
  entry: RealizedPnlEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [form, setForm] = useState<RealizedPnlFormState>(() => formFromRealizedPnl(entry));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/realized-pnl", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, ...realizedPnlPayload(form) })
    });

    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to update realized PnL entry.");
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <p className="section-label">Edit realized PnL</p>
      <RealizedPnlFormFields form={form} setForm={setForm} />
      {error ? <p className="loss">{error}</p> : null}
      <div className="add-actions">
        <button className="add-btn" type="submit">Save</button>
        <button className="cancel-btn" onClick={onCancel} type="button">Cancel</button>
      </div>
    </form>
  );
}

function RealizedPnlFormFields({
  form,
  setForm
}: {
  form: RealizedPnlFormState;
  setForm: Dispatch<SetStateAction<RealizedPnlFormState>>;
}) {
  return (
    <div className="add-fields">
      <select
        className="add-input add-select"
        value={form.assetClass}
        onChange={(e) =>
          setForm((f) => ({ ...f, assetClass: e.target.value as RealizedPnlFormState["assetClass"] }))
        }
      >
        <option value="stock">Stock</option>
        <option value="crypto">Crypto</option>
        <option value="perp">Perp</option>
      </select>
      <select
        className="add-input add-select"
        value={form.side}
        onChange={(e) => setForm((f) => ({ ...f, side: e.target.value as RealizedPnlFormState["side"] }))}
      >
        <option value="long">Long</option>
        <option value="short">Short</option>
      </select>
      <input
        className="add-input"
        placeholder="Ticker"
        required
        value={form.ticker}
        onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
      />
      <input
        className="add-input"
        placeholder="Company / market"
        required
        value={form.company}
        onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
      />
      <input
        className="add-input"
        placeholder="Quantity"
        required
        type="number"
        step="any"
        value={form.quantity}
        onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
      />
      <input
        className="add-input"
        placeholder="Avg entry"
        required
        type="number"
        step="any"
        value={form.entry_price}
        onChange={(e) => setForm((f) => ({ ...f, entry_price: e.target.value }))}
      />
      <input
        className="add-input"
        placeholder="Avg exit"
        required
        type="number"
        step="any"
        value={form.exit_price}
        onChange={(e) => setForm((f) => ({ ...f, exit_price: e.target.value }))}
      />
      <input
        className="add-input"
        placeholder="Fees"
        type="number"
        step="any"
        value={form.fees}
        onChange={(e) => setForm((f) => ({ ...f, fees: e.target.value }))}
      />
      {form.assetClass === "perp" ? (
        <>
          <input
            className="add-input"
            placeholder="Leverage"
            type="number"
            step="any"
            value={form.leverage}
            onChange={(e) => setForm((f) => ({ ...f, leverage: e.target.value }))}
          />
          <select
            className="add-input add-select"
            value={form.margin_mode}
            onChange={(e) =>
              setForm((f) => ({ ...f, margin_mode: e.target.value as RealizedPnlFormState["margin_mode"] }))
            }
          >
            <option value="isolated">Isolated margin</option>
            <option value="shared">Shared margin</option>
          </select>
          <input
            className="add-input"
            placeholder="Margin used"
            type="number"
            step="any"
            value={form.margin_used}
            onChange={(e) => setForm((f) => ({ ...f, margin_used: e.target.value }))}
          />
        </>
      ) : null}
      <select
        className="add-input add-select"
        value={form.currency}
        onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
      >
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
        <option value="JPY">JPY</option>
      </select>
      <input
        className="add-input"
        type="date"
        title="Opened date"
        value={form.opened_at}
        onChange={(e) => setForm((f) => ({ ...f, opened_at: e.target.value }))}
      />
      <input
        className="add-input"
        required
        type="date"
        title="Closed date"
        value={form.closed_at}
        onChange={(e) => setForm((f) => ({ ...f, closed_at: e.target.value }))}
      />
      <input
        className="add-input"
        placeholder="Sector"
        value={form.sector}
        onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
      />
      <textarea
        className="add-input add-textarea"
        placeholder="Note"
        rows={3}
        value={form.note}
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
      />
    </div>
  );
}

function PositionFormFields({
  form,
  setForm
}: {
  form: PositionFormState;
  setForm: Dispatch<SetStateAction<PositionFormState>>;
}) {
  return (
    <div className="add-fields">
      <SegmentedTabs
        options={["Stock", "Crypto"]}
        value={form.assetClass === "crypto" ? "Crypto" : "Stock"}
        onChange={(value) =>
          setForm((f) => ({
            ...f,
            ticker: "",
            company: "",
            coinGeckoId: "",
            assetClass: value === "Crypto" ? "crypto" : "stock"
          }))
        }
      />
      <TickerAutocomplete
        ticker={form.ticker}
        company={form.company}
        assetClass={form.assetClass}
        onSelect={(ticker, company, _assetType, coinGeckoId) =>
          setForm((f) => ({ ...f, ticker, company: company ?? f.company, coinGeckoId: coinGeckoId ?? f.coinGeckoId }))
        }
        required
      />
      <input
        className="add-input"
        placeholder="Company"
        required
        value={form.company}
        onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
      />
      <input
        className="add-input"
        placeholder={form.assetClass === "crypto" ? "Coins" : "Shares"}
        required
        type="number"
        step="any"
        value={form.shares}
        onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
      />
      <input
        className="add-input"
        placeholder="Avg cost"
        required
        type="number"
        step="any"
        value={form.average_cost}
        onChange={(e) => setForm((f) => ({ ...f, average_cost: e.target.value }))}
      />
      <select
        className="add-input add-select"
        value={form.currency}
        onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
      >
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
        <option value="JPY">JPY</option>
      </select>
      <input
        className="add-input"
        type="date"
        title="Entry date"
        value={form.entry_date}
        onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
      />
      <input
        className="add-input"
        placeholder="Sector"
        required
        list="position-sectors"
        value={form.sector}
        onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
      />
      <datalist id="position-sectors">
        <option value="Semiconductors" />
        <option value="Technology" />
        <option value="Energy" />
        <option value="Industrials" />
        <option value="Healthcare" />
        <option value="Materials" />
        <option value="Financials" />
        <option value="Consumer" />
        <option value="Communication" />
        <option value="Utilities" />
        <option value="Crypto" />
      </datalist>
    </div>
  );
}
