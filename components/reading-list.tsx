"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SavedItem } from "@/lib/types";

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
  isAdmin,
  themes
}: {
  items: SavedItem[];
  isAdmin: boolean;
  themes: string[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  async function deleteItem(id: string) {
    await fetch("/api/saved-items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    router.refresh();
  }

  return (
    <div className="reading-section">
      <div className="reading-header">
        <p className="section-label" style={{ margin: 0 }}>Reading List</p>
        {isAdmin && !showForm ? (
          <button className="add-btn" onClick={() => setShowForm(true)} type="button">
            + Save link
          </button>
        ) : null}
      </div>

      {isAdmin && showForm ? (
        <SaveForm themes={themes} onSaved={() => { setShowForm(false); router.refresh(); }} onCancel={() => setShowForm(false)} />
      ) : null}

      {items.length === 0 && !showForm ? (
        <p className="muted" style={{ fontSize: 13 }}>No links saved yet.</p>
      ) : (
        <div className="reading-list">
          {items.map((item) => (
            <div className="reading-item" key={item.id}>
              <div className="reading-item-left">
                <div className="reading-item-top">
                  <span className={`reading-badge ${item.type}`}>{item.type}</span>
                  <a
                    className="reading-title"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.title}
                  </a>
                </div>
                {item.note ? <p className="reading-note">{item.note}</p> : null}
              </div>
              <div className="reading-item-right">
                <span>{domain(item.url)}</span>
                <span className="dot">·</span>
                <span>{relativeTime(item.addedAt)}</span>
                {isAdmin ? (
                  <button
                    className="reading-delete"
                    onClick={() => deleteItem(item.id)}
                    type="button"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SaveForm({
  themes,
  onSaved,
  onCancel
}: {
  themes: string[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<"article" | "paper">("article");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [theme, setTheme] = useState("");
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
      // ignore — user can type manually
    } finally {
      setFetching(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/saved-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, url, title, note: note || undefined, theme: theme || undefined })
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
      <div className="type-toggle">
        <button
          className={`chip${type === "article" ? " active" : ""}`}
          onClick={() => setType("article")}
          type="button"
        >
          Article
        </button>
        <button
          className={`chip${type === "paper" ? " active" : ""}`}
          onClick={() => setType("paper")}
          type="button"
        >
          Paper
        </button>
      </div>

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
          placeholder={fetching ? "Fetching title…" : "Title"}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {themes.length > 0 ? (
          <select className="add-input save-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="">Theme (optional)</option>
            {themes.map((t) => (
              <option key={t} value={t}>{t}</option>
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

      {error ? <p className="loss" style={{ fontSize: 12, margin: 0 }}>{error}</p> : null}

      <div className="add-actions">
        <button className="login-btn" type="submit" style={{ fontSize: 13, padding: "7px 18px" }}>
          Save
        </button>
        <button className="cancel-btn" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
