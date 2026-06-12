"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CONVICTIONS = ["draft", "medium", "high"];
const STATUSES = ["watching", "triggered", "invalidated"];

export function TickerStateEditor({
  ticker,
  conviction,
  status,
  conditions,
  buyTrigger,
  isAdmin
}: {
  ticker: string;
  conviction: string;
  status: string;
  conditions: string[];
  buyTrigger?: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [conv, setConv] = useState(conviction);
  const [stat, setStat] = useState(status);
  const [conds, setConds] = useState(conditions.join("\n"));
  const [trigger, setTrigger] = useState(buyTrigger ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setConv(conviction);
    setStat(status);
    setConds(conditions.join("\n"));
    setTrigger(buyTrigger ?? "");
    setError("");
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        conviction: conv,
        status: stat,
        conditions: conds
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        buyTrigger: trigger.trim()
      })
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save.");
    }
  }

  if (editing) {
    return (
      <section className="detail-grid">
        <div>
          <p className="section-label">Status</p>
          <div className="edit-state-row">
            <select className="add-input add-select" value={conv} onChange={(e) => setConv(e.target.value)}>
              {CONVICTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select className="add-input add-select" value={stat} onChange={(e) => setStat(e.target.value)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="section-label">Entry Conditions</p>
          <textarea
            className="add-input add-textarea"
            rows={4}
            placeholder="One condition per line"
            value={conds}
            onChange={(e) => setConds(e.target.value)}
          />
        </div>

        <div>
          <p className="section-label">Buy Trigger</p>
          <textarea
            className="add-input add-textarea"
            rows={3}
            placeholder="What would make you pull the trigger?"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
          />
          {error ? <p className="loss">{error}</p> : null}
          <div className="add-actions">
            <button className="add-btn" disabled={saving} onClick={save} type="button">
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="cancel-btn" onClick={reset} type="button">
              Cancel
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="detail-grid">
      <div>
        <div className="detail-head">
          <p className="section-label">Status</p>
          {isAdmin ? (
            <button className="edit-btn" onClick={() => setEditing(true)} type="button">
              Edit
            </button>
          ) : null}
        </div>
        <div className="meta-line detail-meta">
          <span className={`meta-chip ${convictionClass(conviction)}`}>{conviction}</span>
          <span className={`meta-chip ${statusClass(status)}`}>{status}</span>
        </div>
      </div>

      <div>
        <p className="section-label">Entry Conditions</p>
        <ul className="conditions">
          {conditions.map((condition) => (
            <li className="condition" key={condition}>
              <span className="condition-marker" />
              <span>{condition}</span>
            </li>
          ))}
        </ul>
      </div>

      {buyTrigger ? (
        <div>
          <p className="section-label">Buy Trigger</p>
          <p className="buy-trigger">{buyTrigger}</p>
        </div>
      ) : null}
    </section>
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
