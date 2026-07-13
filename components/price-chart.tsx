"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area } from "./charts/area-chart";
import { BarChart } from "./charts/bar-chart";
import { Bar } from "./charts/bar";
import { Grid } from "./charts/grid";
import { XAxis } from "./charts/x-axis";
import { YAxis } from "./charts/y-axis";
import { ChartTooltip } from "./charts/tooltip";
import { fmtUsd } from "@/lib/format";
import type { Candle } from "@/lib/types";
import { useBrandColor } from "./use-brand-color";
import { SegmentedTabs } from "./segmented-tabs";

const chartTypeOptions = ["area", "bars"] as const;
type ChartType = (typeof chartTypeOptions)[number];

const monthDayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthYearFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

/** True when the bucketed points span more than one calendar year. */
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

type Bucket = { date: Date; value: number };

/** Buckets close prices into <= maxBuckets groups using the last real price per bucket (never interpolated). */
function bucketLastValue(history: Candle[], maxBuckets: number): Bucket[] {
  if (history.length === 0) return [];
  if (history.length <= maxBuckets) {
    return history.map((c) => ({ date: new Date(c.time * 1000), value: c.close }));
  }
  const bucketSize = history.length / maxBuckets;
  const buckets: Bucket[] = [];
  for (let i = 0; i < maxBuckets; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(history.length, Math.floor((i + 1) * bucketSize));
    if (start >= end) continue;
    const slice = history.slice(start, end);
    const last = slice[slice.length - 1];
    buckets.push({ date: new Date(last.time * 1000), value: last.close });
  }
  return buckets;
}

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
  const [chartType, setChartType] = useState<ChartType>("area");
  const fetchedBrandColor = useBrandColor(ticker, company, storedBrandColor === undefined);
  const brandColor = storedBrandColor === undefined ? fetchedBrandColor : storedBrandColor;
  const seriesColor = brandColor ?? "var(--color-accent)";

  const areaData = history.map((c) => ({ date: new Date(c.time * 1000), value: c.close }));
  const barData = bucketLastValue(history, 60);

  const areaAxisFormatter = useMemo(() => axisFormatterFor(areaData), [areaData]);
  const barAxisFormatter = useMemo(() => axisFormatterFor(barData), [barData]);

  const tooltipContent = ({ point }: { point: Record<string, unknown> }) => {
    const bucket = point as unknown as Bucket;
    return (
      <div style={{ padding: "8px 12px" }}>
        <div className="tabular" style={{ fontWeight: 650, fontSize: 13 }}>
          {fmtUsd(bucket.value)}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-neutral)" }}>
          {bucket.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
      <div className="portfolio-chart-header">
        <p className="section-label">Price chart</p>
        <SegmentedTabs options={[...chartTypeOptions]} value={chartType} onChange={(value) => setChartType(value as ChartType)} />
      </div>
      <div className="bk-chart">
        {chartType === "area" ? (
          <AreaChart data={areaData} xDataKey="date" style={{ height: 380 }} yDomainMode="data">
            <Grid />
            <Area dataKey="value" stroke={seriesColor} fill={seriesColor} />
            <XAxis formatLabel={areaAxisFormatter} />
            <YAxis formatValue={fmtCompactUsd} />
            <ChartTooltip content={tooltipContent} />
          </AreaChart>
        ) : (
          <div className="bk-chart-fixed-height">
            <BarChart data={barData} xDataKey="date">
              <Grid />
              <Bar dataKey="value" fill={seriesColor} lineCap={2} />
              <XAxis formatLabel={barAxisFormatter} />
              <YAxis formatValue={fmtCompactUsd} />
              <ChartTooltip content={tooltipContent} />
            </BarChart>
          </div>
        )}
      </div>
    </div>
  );
}
