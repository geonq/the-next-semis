"use client";

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { fmtSignedPct, fmtSignedUsd, fmtUsd, signClass } from "@/lib/format";
import { enrichPositions, portfolioSummary } from "@/lib/portfolio";
import type { EnrichedPosition, Position, QuotesByTicker, WatchlistEntry } from "@/lib/types";
import { SegmentedTabs } from "./segmented-tabs";
import { TickerAutocomplete } from "./ticker-autocomplete";
import { useLiveQuotes } from "./use-live-quotes";

export function PortfolioClient({
  positions,
  initialQuotes,
  tickers,
  coingeckoParam,
  watchlist,
  isAdmin
}: {
  positions: Position[];
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
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);

  async function deletePosition(ticker: string) {
    await fetch("/api/positions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker })
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

      <Concentration enriched={enriched} watchlist={watchlist} positions={positions} />

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
