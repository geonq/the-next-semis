"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = { ticker: string; company: string; exchange: string };

export function TickerAutocomplete({
  ticker,
  company,
  onSelect,
  required
}: {
  ticker: string;
  company: string;
  onSelect: (ticker: string, company: string) => void;
  required?: boolean;
}) {
  const [query, setQuery] = useState(ticker);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(ticker);
  }, [ticker]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setHighlighted(-1);
    onSelect(value.toUpperCase(), company);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (value.length < 1) {
      setSuggestions([]);
      setOpen(false);
      onSelect("", "");
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 220);
  }

  function pick(s: Suggestion) {
    setQuery(s.ticker);
    setSuggestions([]);
    setOpen(false);
    onSelect(s.ticker, s.company);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="autocomplete-wrap" ref={wrapRef}>
      <input
        className="add-input"
        placeholder="Ticker"
        required={required}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {open && (
        <ul className="autocomplete-list">
          {suggestions.map((s, i) => (
            <li
              key={s.ticker}
              className={`autocomplete-item${i === highlighted ? " highlighted" : ""}`}
              onMouseDown={() => pick(s)}
            >
              <span className="ac-ticker">{s.ticker}</span>
              <span className="ac-company">{s.company}</span>
              {s.exchange ? <span className="ac-exchange">{s.exchange}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
