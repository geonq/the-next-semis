"use client";

import { useMemo } from "react";
import { AreaChart, Area } from "./charts/area-chart";
import { Grid } from "./charts/grid";
import { XAxis } from "./charts/x-axis";
import { YAxis } from "./charts/y-axis";
import { ChartTooltip } from "./charts/tooltip";
import { fmtUsd } from "@/lib/format";
import type { Candle } from "@/lib/types";
import { useBrandColor } from "./use-brand-color";

const monthDayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthYearFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

/** True when the visible history spans more than one calendar year. */
function spansMultipleYears(points: { date: Date }[]): boolean {
  if (points.length === 0) return false;
  const first = points[0]?.date;
  const last = points[points.length - 1]?.date;
  if (!first || !last) return false;
  return first.getFullYear() !== last.getFullYear();
}

/** Month/year format when the visible history spans multiple calendar years, month/day for short recent windows. */
function axisFormatterFor(points: { date: Date }[]): (date: Date) => string {
  if (spansMultipleYears(points)) {
    return (date: Date) => monthYearFmt.format(date);
  }
  return (date: Date) => monthDayFmt.format(date);
}

function fmtCompactUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(4)}`;
}

type ChartPoint = { date: Date; value: number };

export function PriceChart({
  history,
  ticker,
  company,
  brandColor: storedBrandColor
}: {
  history: Candle[];
  ticker: string;
  company: string;
  brandColor?: string | null;
}) {
  const fetchedBrandColor = useBrandColor(ticker, company, storedBrandColor === undefined);
  const brandColor = storedBrandColor === undefined ? fetchedBrandColor : storedBrandColor;
  const seriesColor = brandColor ?? "var(--color-accent)";

  const areaData = history.map((c) => ({ date: new Date(c.time * 1000), value: c.close }));

  const areaAxisFormatter = useMemo(() => axisFormatterFor(areaData), [areaData]);

  const tooltipContent = ({ point }: { point: Record<string, unknown> }) => {
    const chartPoint = point as unknown as ChartPoint;
    return (
      <div style={{ padding: "8px 12px" }}>
        <div className="tabular" style={{ fontWeight: 650, fontSize: 13 }}>
          {fmtUsd(chartPoint.value)}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-neutral)" }}>
          {chartPoint.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>
    );
  };

  if (history.length === 0) {
    return (
      <div className="chart-section">
        <p className="muted">No price history available.</p>
      </div>
    );
  }

  return (
    <div className="chart-section">
      <div className="bk-chart">
        <AreaChart data={areaData} xDataKey="date" style={{ height: 380 }} yDomainMode="data">
          <Grid />
          <Area dataKey="value" stroke={seriesColor} fill={seriesColor} />
          <XAxis formatLabel={areaAxisFormatter} />
          <YAxis formatValue={fmtCompactUsd} />
          <ChartTooltip content={tooltipContent} />
        </AreaChart>
      </div>
    </div>
  );
}
