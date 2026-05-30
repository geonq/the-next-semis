"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/types";

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NewsPanel({ ticker }: { ticker: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch(`/api/news/${ticker}`)
        .then((r) => r.json())
        .then((data: NewsItem[]) => {
          if (!cancelled) {
            setNews(data);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ticker]);

  if (loading) {
    return (
      <div className="news-panel">
        <p className="section-label">News</p>
        <p className="muted">Loading...</p>
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <div className="news-panel">
        <p className="section-label">News</p>
        <p className="muted">No recent news.</p>
      </div>
    );
  }

  return (
    <div className="news-panel">
      <p className="section-label">News</p>
      <div className="news-list">
        {news.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="news-item"
          >
            <p className="news-title">{item.title}</p>
            <p className="news-meta">
              {item.publisher}
              <span className="dot">·</span>
              {relativeTime(item.publishedAt)}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
