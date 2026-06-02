"use client";

import { type CSSProperties, type ReactNode } from "react";
import { useBrandColor } from "./use-brand-color";

export function BrandTicker({
  ticker,
  company,
  brandColor,
  className = "ticker",
  children
}: {
  ticker: string;
  company: string;
  brandColor?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const fetchedColor = useBrandColor(ticker, company, brandColor === undefined);
  const color = brandColor === undefined ? fetchedColor : brandColor;
  const style = color ? ({ "--brand-color": color } as CSSProperties) : undefined;

  return (
    <span className={`${className} brand-ticker`} style={style}>
      {children ?? ticker}
    </span>
  );
}
