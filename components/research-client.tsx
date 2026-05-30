"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fmtAbs, fmtSignedPct, signClass } from "@/lib/format";
import { enrichWatchlist } from "@/lib/research";
import type { QuotesByTicker, WatchlistEntry } from "@/lib/types";
import { useLiveQuotes } from "./use-live-quotes";

export function ResearchClient({
  entries,
  initialQuotes,
  tickers,
  themes,
  convictions,
  isAdmin
}: {
  entries: WatchlistEntry[];
  initialQuotes: QuotesByTicker;
  tickers: string[];
  themes: string[];
  convictions: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const quotes = useLiveQuotes(initialQuotes, tickers);
  const [activeThemes, setActiveThemes] = useState<Set<string>>(new Set());
  const [activeConvictions, setActiveConvictions] = useState<Set<string>>(new Set());
  const enriched = enrichWatchlist(entries, quotes);

  const visible = useMemo(() => {
    return enriched.filter((entry) => {
      const themeOk = activeThemes.size === 0 || activeThemes.has(entry.theme);
      const convictionOk = activeConvictions.size === 0 || activeConvictions.has(entry.conviction);
      return themeOk && convictionOk;
    });
  }, [activeConvictions, activeThemes, enriched]);

  async function deleteTicker(ticker: string) {
    await fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker })
    });
    router.refresh();
  }

  return (
    <>
      <div className="filter-bar">
        <FilterGroup label="Theme" values={themes} active={activeThemes} onChange={setActiveThemes} />
        <FilterGroup
          label="Conviction"
          values={convictions}
          active={activeConvictions}
          onChange={setActiveConvictions}
        />
      </div>

      <div className="research-grid">
        {visible.map((entry) => (
          <div className="research-card-wrap" key={entry.ticker}>
            <Link className="research-card" href={`/research/${entry.ticker}`}>
              <div className="card-top">
                <div>
                  <p className="ticker">{entry.ticker}</p>
                  <p className="subtle">{entry.company}</p>
                </div>
                {entry.current_price != null ? (
                  <div className="card-price">
                    <p className="ticker tabular">${fmtAbs(entry.current_price)}</p>
                    <p className={`subtle tabular ${signClass(entry.day_change_percent)}`}>
                      {fmtSignedPct(entry.day_change_percent)}
                    </p>
                  </div>
                ) : null}
              </div>

              <p className="meta-line">
                {entry.theme}
                <span className="dot">·</span>
                <span className={convictionClass(entry.conviction)}>{entry.conviction}</span>
                <span className="dot">·</span>
                <span className={statusClass(entry.status)}>{entry.status}</span>
              </p>

              <ul className="conditions">
                {entry.conditions.slice(0, 3).map((condition) => (
                  <li className="condition" key={condition}>
                    <span className="muted">-</span>
                    {condition}
                  </li>
                ))}
              </ul>
            </Link>
            {isAdmin ? (
              <button
                className="card-delete-btn"
                onClick={() => deleteTicker(entry.ticker)}
                type="button"
                aria-label={`Remove ${entry.ticker}`}
              >
                ✕
              </button>
            ) : null}
          </div>
        ))}
        {visible.length === 0 ? <p className="muted">No entries match the active filters.</p> : null}
      </div>

      {isAdmin ? <AddTickerForm onAdded={() => router.refresh()} /> : null}
    </>
  );
}

function AddTickerForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    ticker: "",
    company: "",
    theme: "",
    conditions: "",
    conviction: "draft",
    status: "watching"
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: form.ticker,
        company: form.company,
        theme: form.theme,
        conditions: form.conditions
          .split("\n")
          .map((c) => c.trim())
          .filter(Boolean),
        conviction: form.conviction,
        status: form.status
      })
    });

    if (res.ok) {
      setForm({ ticker: "", company: "", theme: "", conditions: "", conviction: "draft", status: "watching" });
      setOpen(false);
      onAdded();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to add ticker.");
    }
  }

  if (!open) {
    return (
      <button className="add-btn" onClick={() => setOpen(true)} type="button">
        + Add ticker
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <p className="section-label">New watchlist entry</p>
      <div className="add-fields">
        <input
          className="add-input"
          placeholder="Ticker"
          required
          value={form.ticker}
          onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
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
          placeholder="Theme"
          required
          value={form.theme}
          onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))}
        />
        <input
          className="add-input"
          placeholder="Conviction (draft / medium / high)"
          value={form.conviction}
          onChange={(e) => setForm((f) => ({ ...f, conviction: e.target.value }))}
        />
        <input
          className="add-input"
          placeholder="Status (watching / triggered / invalidated)"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
        />
        <textarea
          className="add-input add-textarea"
          placeholder="Entry conditions (one per line)"
          rows={3}
          value={form.conditions}
          onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
        />
      </div>
      {error ? <p className="loss">{error}</p> : null}
      <div className="add-actions">
        <button className="add-btn" type="submit">Add</button>
        <button className="cancel-btn" onClick={() => setOpen(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}

function FilterGroup({
  label,
  values,
  active,
  onChange
}: {
  label: string;
  values: string[];
  active: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <div className="filter-group">
      <span className="subtle">{label}</span>
      {values.map((value) => (
        <button
          className={`chip ${active.has(value) ? "active" : ""}`}
          key={value}
          onClick={() => {
            const next = new Set(active);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            onChange(next);
          }}
          type="button"
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function convictionClass(value: string): string {
  if (value === "high") return "gain";
  if (value === "medium") return "accent";
  return "neutral";
}

function statusClass(value: string): string {
  if (value === "triggered") return "gain";
  if (value === "invalidated") return "loss";
  return "neutral";
}
