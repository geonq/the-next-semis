"use client";

import type { CSSProperties } from "react";

export function SegmentedTabs({
  options,
  value,
  onChange
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const activeIndex = Math.max(0, options.indexOf(value));

  const style = { "--segments": options.length } as CSSProperties & Record<string, number>;

  return (
    <div className="segmented" style={style}>
      <span className="segmented-indicator" style={{ transform: `translateX(${activeIndex * 100}%)` }} />
      {options.map((option) => (
        <button
          className={`segmented-option${value === option ? " active" : ""}`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
