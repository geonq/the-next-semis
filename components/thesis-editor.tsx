"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";

export function ThesisEditor({ markdown, isAdmin }: { markdown: string; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(markdown);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    await fetch("/api/thesis", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: text })
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="hairline">
      <div className="thesis-header">
        <p className="section-label">Thesis</p>
        {isAdmin && !editing ? (
          <button className="edit-btn" onClick={() => setEditing(true)} type="button">
            Edit
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="thesis-edit">
          <textarea
            className="thesis-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={22}
          />
          <div className="add-actions">
            <button className="login-btn" onClick={save} disabled={saving} type="button">
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              className="cancel-btn"
              onClick={() => {
                setText(markdown);
                setEditing(false);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="thesis">{renderMarkdown(text)}</div>
      )}
    </section>
  );
}
