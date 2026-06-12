"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { capitalizeFirst } from "@/lib/format";
import type { SavedItem } from "@/lib/types";
import { SegmentedTabs } from "./segmented-tabs";

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ReadingList({
  items,
  allItems,
  ticker,
  defaultTheme,
  isAdmin,
  themes
}: {
  items: SavedItem[];
  allItems?: SavedItem[];
  ticker?: string;
  defaultTheme?: string;
  isAdmin: boolean;
  themes: string[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState("All");
  const [theme, setTheme] = useState("All");
  const [visibleCount, setVisibleCount] = useState(10);
  const sortedItems = useMemo(() => items.slice().sort((a, b) => b.addedAt - a.addedAt), [items]);

  const filteredItems = useMemo(() => {
    return sortedItems.filter((item) => {
      const typeOk = type === "All" || item.type === (type === "Articles" ? "article" : "paper");
      const themeOk = theme === "All" || item.theme === theme;
      return typeOk && themeOk;
    });
  }, [sortedItems, theme, type]);

  const visibleItems = filteredItems.slice(0, visibleCount);
  const attachable = ticker
    ? (allItems ?? []).filter((item) => !item.tickers.includes(ticker)).sort((a, b) => b.addedAt - a.addedAt)
    : [];

  async function deleteItem(id: string) {
    await fetch("/api/saved-items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    router.refresh();
  }

  async function patchItem(id: string, action: "attach" | "detach") {
    if (!ticker) return;
    await fetch("/api/saved-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ticker, action })
    });
    setShowAttach(false);
    router.refresh();
  }

  function changeType(next: string) {
    setType(next);
    setVisibleCount(10);
  }

  function changeTheme(next: string) {
    setTheme(next);
    setVisibleCount(10);
  }

  return (
    <div className="reading-section">
      <div className="reading-header">
        <p className="section-label reading-title-label">Reading List</p>
        <div className="reading-actions">
          {isAdmin && ticker ? (
            <button className="add-btn" onClick={() => setShowAttach((v) => !v)} type="button">
              + Add existing
            </button>
          ) : null}
          {isAdmin && !showForm ? (
            <button className="add-btn" onClick={() => setShowForm(true)} type="button">
              + Save link
            </button>
          ) : null}
        </div>
      </div>

      <div className="reading-toolbar">
        <SegmentedTabs options={["All", "Articles", "Papers"]} value={type} onChange={changeType} />
        {themes.length > 0 ? (
          <select className="add-input reading-theme-filter" value={theme} onChange={(e) => changeTheme(e.target.value)}>
            <option value="All">All themes</option>
            {themes.map((candidate) => (
              <option key={candidate} value={candidate}>
                {capitalizeFirst(candidate)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {isAdmin && ticker && showAttach ? (
        <div className="attach-panel">
          {attachable.length === 0 ? (
            <p className="muted">No unattached links.</p>
          ) : (
            attachable.map((item) => (
              <button className="attach-item" key={item.id} onClick={() => patchItem(item.id, "attach")} type="button">
                <span className={`reading-badge ${item.type}`}>{item.type}</span>
                <span>{item.title}</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {isAdmin && showForm ? (
        <SaveForm
          themes={themes}
          ticker={ticker}
          defaultTheme={defaultTheme}
          onSaved={() => {
            setShowForm(false);
            router.refresh();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {filteredItems.length === 0 && !showForm ? (
        <p className="muted reading-empty">No links saved yet.</p>
      ) : (
        <>
          <div className="reading-list">
            {visibleItems.map((item) =>
              isAdmin && editingId === item.id ? (
                <SaveForm
                  key={item.id}
                  themes={themes}
                  editItem={item}
                  onSaved={() => {
                    setEditingId(null);
                    router.refresh();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="reading-item" key={item.id}>
                  <div className="reading-item-left">
                    <a className="reading-title" href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.title}
                    </a>
                    <span className={`reading-badge ${item.type}`}>{item.type}</span>
                    {item.note ? (
                      <>
                        <p className="reading-note-label">Notes</p>
                        <p className="reading-note">{item.note}</p>
                      </>
                    ) : null}
                    <div className="reading-meta">
                      {item.theme ? <span className="reading-theme">{capitalizeFirst(item.theme)}</span> : null}
                      <span>{domain(item.url)}</span>
                      <span className="dot">·</span>
                      <span>{relativeTime(item.addedAt)}</span>
                    </div>
                  </div>
                  {isAdmin ? (
                    <div className="reading-item-right">
                      <button
                        className="reading-delete"
                        onClick={() => setEditingId(item.id)}
                        type="button"
                        aria-label="Edit"
                      >
                        ✎
                      </button>
                      {ticker ? (
                        <button
                          className="reading-delete"
                          onClick={() => patchItem(item.id, "detach")}
                          type="button"
                          aria-label={`Remove from ${ticker}`}
                        >
                          ↩
                        </button>
                      ) : null}
                      <button
                        className="reading-delete"
                        onClick={() => deleteItem(item.id)}
                        type="button"
                        aria-label="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            )}
          </div>
          {visibleItems.length < filteredItems.length ? (
            <button className="reading-more" onClick={() => setVisibleCount((count) => count + 10)} type="button">
              ⋯
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function SaveForm({
  themes,
  ticker,
  defaultTheme,
  editItem,
  onSaved,
  onCancel
}: {
  themes: string[];
  ticker?: string;
  defaultTheme?: string;
  editItem?: SavedItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<"article" | "paper">(editItem?.type ?? "article");
  const [url, setUrl] = useState(editItem?.url ?? "");
  const [title, setTitle] = useState(editItem?.title ?? "");
  const [note, setNote] = useState(editItem?.note ?? "");
  const [theme, setTheme] = useState(editItem?.theme ?? defaultTheme ?? "");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  async function fetchTitle(rawUrl: string) {
    if (!rawUrl || title) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/fetch-meta?url=${encodeURIComponent(rawUrl)}`);
      const data = await res.json();
      if (data.title) setTitle(data.title);
    } catch {
      // User can type manually.
    } finally {
      setFetching(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = editItem
      ? await fetch("/api/saved-items", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editItem.id,
            type,
            url,
            title,
            note: note || undefined,
            theme: theme || undefined
          })
        })
      : await fetch("/api/saved-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            url,
            title,
            note: note || undefined,
            theme: theme || undefined,
            tickers: ticker ? [ticker] : []
          })
        });

    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to save.");
    }
  }

  return (
    <form className="save-form" onSubmit={handleSubmit}>
      <SegmentedTabs
        options={["Article", "Paper"]}
        value={type === "article" ? "Article" : "Paper"}
        onChange={(next) => setType(next === "Paper" ? "paper" : "article")}
      />

      <div className="save-fields">
        <input
          className="add-input save-url"
          placeholder="URL"
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={(e) => fetchTitle(e.target.value)}
        />
        <input
          className="add-input save-title"
          placeholder={fetching ? "Fetching title..." : "Title"}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {themes.length > 0 ? (
          <select className="add-input save-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="">Theme (optional)</option>
            {themes.map((candidate) => (
              <option key={candidate} value={candidate}>
                {capitalizeFirst(candidate)}
              </option>
            ))}
          </select>
        ) : null}
        <textarea
          className="add-input save-note"
          placeholder="Note (optional)"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error ? <p className="loss save-error">{error}</p> : null}

      <div className="add-actions">
        <button className="login-btn save-submit" type="submit">
          Save
        </button>
        <button className="cancel-btn" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
