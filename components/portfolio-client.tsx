"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fmtSignedPct, fmtSignedUsd, fmtUsd, signClass } from "@/lib/format";
import { enrichPositions, portfolioSummary } from "@/lib/portfolio";
import type { Position, QuotesByTicker } from "@/lib/types";
import { TickerAutocomplete } from "./ticker-autocomplete";
import { useLiveQuotes } from "./use-live-quotes";

export function PortfolioClient({
  positions,
  initialQuotes,
  tickers,
  isAdmin
}: {
  positions: Position[];
  initialQuotes: QuotesByTicker;
  tickers: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const quotes = useLiveQuotes(initialQuotes, tickers);
  const enriched = enrichPositions(positions, quotes).sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0));
  const summary = portfolioSummary(enriched);

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

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Position</th>
              <th>Shares</th>
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
                  <span className="ticker">{position.ticker}</span>{" "}
                  <span className="subtle">{position.company}</span>
                </td>
                <td className="tabular">{position.shares.toLocaleString("en-US")}</td>
                <td className="tabular">{fmtUsd(position.average_cost)}</td>
                <td className="tabular">{fmtUsd(position.current_price)}</td>
                <td className="tabular">{fmtUsd(position.total_value)}</td>
                <td className={`tabular ${signClass(position.pnl_dollars)}`}>{fmtSignedUsd(position.pnl_dollars)}</td>
                <td className={`tabular ${signClass(position.pnl_percent)}`}>{fmtSignedPct(position.pnl_percent)}</td>
                <td className={`tabular ${signClass(position.day_change_percent)}`}>
                  {fmtSignedPct(position.day_change_percent)}
                </td>
                {isAdmin ? (
                  <td>
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

      {isAdmin ? <AddPositionForm onAdded={() => router.refresh()} /> : null}
    </div>
  );
}

function AddPositionForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    ticker: "",
    company: "",
    shares: "",
    average_cost: "",
    currency: "USD",
    sector: ""
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: form.ticker,
        company: form.company,
        shares: parseFloat(form.shares),
        average_cost: parseFloat(form.average_cost),
        currency: form.currency,
        sector: form.sector
      })
    });

    if (res.ok) {
      setForm({ ticker: "", company: "", shares: "", average_cost: "", currency: "USD", sector: "" });
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
        + Add position
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <p className="section-label">New position</p>
      <div className="add-fields">
        <TickerAutocomplete
          ticker={form.ticker}
          company={form.company}
          onSelect={(ticker, company) => setForm((f) => ({ ...f, ticker, company: company ?? f.company }))}
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
          placeholder="Shares"
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
        <input
          className="add-input"
          placeholder="Currency"
          required
          value={form.currency}
          onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
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
        </datalist>
      </div>
      {error ? <p className="loss">{error}</p> : null}
      <div className="add-actions">
        <button className="add-btn" type="submit">Add</button>
        <button className="cancel-btn" onClick={() => setOpen(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}
