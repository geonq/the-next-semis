"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useBrandColor } from "./use-brand-color";

export function BrandTicker({
  ticker,
  company,
  className = "ticker",
  children
}: {
  ticker: string;
  company: string;
  className?: string;
  children?: ReactNode;
}) {
  const color = useBrandColor(ticker, company);
  const style = color ? ({ "--brand-color": color } as CSSProperties) : undefined;

  return (
    <span className={`${className} brand-ticker`} style={style}>
      {children ?? ticker}
    </span>
  );
}
