"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchDoc } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ResearchDocs({ docs, isAdmin }: { docs: ResearchDoc[]; isAdmin: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/research-docs", { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
    } else {
      router.refresh();
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(id: string) {
    await fetch("/api/research-docs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    router.refresh();
  }

  return (
    <div className="reading-section">
      <div className="reading-header">
        <p className="section-label reading-title-label">Research Docs</p>
        {isAdmin ? (
          <div className="reading-actions">
            <input
              ref={fileRef}
              type="file"
              accept=".md,.pdf"
              style={{ display: "none" }}
              onChange={handleUpload}
            />
            <button
              className="add-btn"
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "+ Upload"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="reading-empty" style={{ color: "var(--color-loss)" }}>{error}</p> : null}

      {docs.length === 0 ? (
        <p className="reading-empty">No documents yet.</p>
      ) : (
        <div className="reading-list">
          {docs.map((doc) => (
            <div className="reading-item" key={doc.id}>
              <div className="reading-item-left">
                <div className="reading-item-top">
                  <span className={`reading-badge ${doc.type}`}>{doc.type.toUpperCase()}</span>
                  <a
                    className="reading-title"
                    href={`/api/research-docs?id=${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {doc.name}
                  </a>
                </div>
              </div>
              <div className="reading-item-right">
                <span>{formatBytes(doc.size)}</span>
                <span>·</span>
                <span>{relativeTime(doc.addedAt)}</span>
                {isAdmin ? (
                  <button
                    className="reading-delete"
                    onClick={() => handleDelete(doc.id)}
                    type="button"
                    aria-label="Delete"
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
