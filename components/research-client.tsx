"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { capitalizeFirst, fmtAbs, fmtSignedPct, signClass } from "@/lib/format";
import { enrichWatchlist } from "@/lib/research";
import type { QuotesByTicker, SavedItem, WatchlistEntry } from "@/lib/types";
import { BrandTicker } from "./brand-ticker";
import { ReadingList } from "./reading-list";
import { SegmentedTabs } from "./segmented-tabs";
import { TickerAutocomplete } from "./ticker-autocomplete";
import { useLiveQuotes } from "./use-live-quotes";

type AssetType = "equity" | "etf" | "crypto";

export function ResearchClient({
  entries,
  initialQuotes,
  tickers,
  themes,
  isAdmin,
  savedItems
}: {
  entries: WatchlistEntry[];
  initialQuotes: QuotesByTicker;
  savedItems: SavedItem[];
  tickers: string[];
  themes: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const quotes = useLiveQuotes(initialQuotes, tickers);
  const [activeThemes, setActiveThemes] = useState<Set<string>>(new Set());
  const [conviction, setConviction] = useState("All");
  const enriched = enrichWatchlist(entries, quotes);

  const visible = useMemo(() => {
    return enriched.filter((entry) => {
      const themeOk = activeThemes.size === 0 || activeThemes.has(entry.theme);
      const convictionOk = conviction === "All" || entry.conviction === conviction.toLowerCase();
      return themeOk && convictionOk;
    });
  }, [activeThemes, conviction, enriched]);

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
        <SegmentedTabs
          options={["All", "Draft", "Medium", "High"]}
          value={conviction}
          onChange={setConviction}
        />
        <FilterDropdown
          themes={themes}
          activeThemes={activeThemes}
          onChangeThemes={setActiveThemes}
        />
      </div>

      <div className="research-grid">
        {visible.map((entry) => (
          <div className="research-card-wrap" key={entry.ticker}>
            <Link className="research-card" href={`/research/${entry.ticker}`}>
              <div className="card-top">
                <div>
                  <BrandTicker
                    ticker={entry.ticker}
                    company={entry.company}
                    brandColor={entry.brandColor}
                    className="ticker card-ticker"
                  />
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
                {capitalizeFirst(entry.theme)}
                <span className="dot">·</span>
                <span>{entry.assetType}</span>
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
  activeThemes,
  onChangeThemes
}: {
  themes: string[];
  activeThemes: Set<string>;
  onChangeThemes: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const totalActive = activeThemes.size;

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
                    {capitalizeFirst(v)}
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
    assetType: "equity" as AssetType,
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
        assetType: form.assetType,
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
      setForm({
        ticker: "",
        company: "",
        assetType: "equity",
        theme: "",
        conditions: "",
        conviction: "draft",
        status: "watching"
      });
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
          onSelect={(ticker, company, assetType) =>
            setForm((f) => ({ ...f, ticker, company: company ?? f.company, assetType: assetType ?? f.assetType }))
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
          placeholder="Theme"
          required
          list="watchlist-themes"
          value={form.theme}
          onChange={(e) => setForm((f) => ({ ...f, theme: capitalizeFirst(e.target.value) }))}
        />
        <datalist id="watchlist-themes">
          {themes.map((t) => (
            <option key={t} value={capitalizeFirst(t)} />
          ))}
        </datalist>

        <select
          className="add-input add-select"
          value={form.assetType}
          onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value as AssetType }))}
        >
          <option value="equity">equity</option>
          <option value="etf">etf</option>
          <option value="crypto">crypto</option>
        </select>

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
