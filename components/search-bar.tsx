"use client";

import { useState, type FormEvent } from "react";

export function SearchBar({ prefill = "" }: { prefill?: string }) {
  const [query, setQuery] = useState(prefill);
  const [open, setOpen] = useState(false);

  function openNews(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    window.open(`https://news.google.com/search?q=${encodeURIComponent(query.trim())}`, "_blank", "noopener");
  }

  function openPapers(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    window.open(`https://scholar.google.com/scholar?q=${encodeURIComponent(query.trim())}`, "_blank", "noopener");
  }

  if (!open) {
    return (
      <button className="search-toggle" onClick={() => setOpen(true)} type="button" aria-label="Search">
        ⌕
      </button>
    );
  }

  return (
    <div className="search-bar">
      <input
        autoFocus
        className="search-input"
        placeholder="Search…"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button className="search-btn" onClick={openNews} type="button">
        News
      </button>
      <button className="search-btn" onClick={openPapers} type="button">
        Papers
      </button>
      <button className="search-close" onClick={() => setOpen(false)} type="button" aria-label="Close search">
        ✕
      </button>
    </div>
  );
}
