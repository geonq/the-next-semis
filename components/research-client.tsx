"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fmtAbs, fmtSignedPct, signClass } from "@/lib/format";
import { enrichWatchlist } from "@/lib/research";
import type { QuotesByTicker, SavedItem, WatchlistEntry } from "@/lib/types";
import { ReadingList } from "./reading-list";
import { TickerAutocomplete } from "./ticker-autocomplete";
import { useLiveQuotes } from "./use-live-quotes";

export function ResearchClient({
  entries,
  initialQuotes,
  tickers,
  themes,
  convictions,
  isAdmin,
  savedItems
}: {
  entries: WatchlistEntry[];
  initialQuotes: QuotesByTicker;
  savedItems: SavedItem[];
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
      <div className="research-toolbar">
        <FilterDropdown
          themes={themes}
          convictions={convictions}
          activeThemes={activeThemes}
          activeConvictions={activeConvictions}
          onChangeThemes={setActiveThemes}
          onChangeConvictions={setActiveConvictions}
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

      {isAdmin ? <AddTickerForm themes={themes} onAdded={() => router.refresh()} /> : null}

      <ReadingList
        items={savedItems.slice().sort((a, b) => b.addedAt - a.addedAt)}
        isAdmin={isAdmin}
        themes={themes}
      />
    </>
  );
}

function FilterDropdown({
  themes,
  convictions,
  activeThemes,
  activeConvictions,
  onChangeThemes,
  onChangeConvictions
}: {
  themes: string[];
  convictions: string[];
  activeThemes: Set<string>;
  activeConvictions: Set<string>;
  onChangeThemes: (s: Set<string>) => void;
  onChangeConvictions: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const totalActive = activeThemes.size + activeConvictions.size;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle(set: Set<string>, value: string, onChange: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <div className="filter-wrap" ref={wrapRef}>
      <button
        className={`filter-btn${totalActive > 0 ? " filter-btn-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M1 2h11M3 6.5h7M5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Filter
        {totalActive > 0 ? <span className="filter-count">{totalActive}</span> : null}
      </button>

      {open ? (
        <div className="filter-panel">
          {themes.length > 0 ? (
            <div className="filter-section">
              <p className="filter-section-label">Theme</p>
              <div className="filter-chips">
                {themes.map((v) => (
                  <button
                    key={v}
                    className={`chip${activeThemes.has(v) ? " active" : ""}`}
                    onClick={() => toggle(activeThemes, v, onChangeThemes)}
                    type="button"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {convictions.length > 0 ? (
            <div className="filter-section">
              <p className="filter-section-label">Conviction</p>
              <div className="filter-chips">
                {convictions.map((v) => (
                  <button
                    key={v}
                    className={`chip${activeConvictions.has(v) ? " active" : ""}`}
                    onClick={() => toggle(activeConvictions, v, onChangeConvictions)}
                    type="button"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {totalActive > 0 ? (
            <button
              className="filter-clear"
              onClick={() => {
                onChangeThemes(new Set());
                onChangeConvictions(new Set());
              }}
              type="button"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AddTickerForm({ themes, onAdded }: { themes: string[]; onAdded: () => void }) {
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
        <TickerAutocomplete
          ticker={form.ticker}
          company={form.company}
          onSelect={(ticker, company) => setForm((f) => ({ ...f, ticker, company }))}
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
          placeholder="Theme"
          required
          list="watchlist-themes"
          value={form.theme}
          onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))}
        />
        <datalist id="watchlist-themes">
          {themes.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <select
          className="add-input add-select"
          value={form.conviction}
          onChange={(e) => setForm((f) => ({ ...f, conviction: e.target.value }))}
        >
          <option value="draft">draft</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>

        <select
          className="add-input add-select"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="watching">watching</option>
          <option value="triggered">triggered</option>
          <option value="invalidated">invalidated</option>
        </select>

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
        <button className="add-btn" type="submit">
          Add
        </button>
        <button className="cancel-btn" onClick={() => setOpen(false)} type="button">
          Cancel
        </button>
      </div>
    </form>
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
