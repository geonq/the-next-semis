"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtAbs, fmtSignedPct, signClass } from "@/lib/format";
import { enrichWatchlist } from "@/lib/research";
import type { QuotesByTicker, WatchlistEntry } from "@/lib/types";
import { useLiveQuotes } from "./use-live-quotes";

export function ResearchClient({
  entries,
  initialQuotes,
  tickers,
  themes,
  convictions
}: {
  entries: WatchlistEntry[];
  initialQuotes: QuotesByTicker;
  tickers: string[];
  themes: string[];
  convictions: string[];
}) {
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
          <Link className="research-card" href={`/research/${entry.ticker}`} key={entry.ticker}>
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
        ))}
        {visible.length === 0 ? <p className="muted">No entries match the active filters.</p> : null}
      </div>
    </>
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
