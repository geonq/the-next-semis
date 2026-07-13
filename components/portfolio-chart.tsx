"use client";

import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area } from "./charts/area-chart";
import { Grid } from "./charts/grid";
import { XAxis } from "./charts/x-axis";
import { YAxis } from "./charts/y-axis";
import { ChartTooltip } from "./charts/tooltip";
import { useChart } from "./charts/chart-context";
import { fmtUsd } from "@/lib/format";
import type { PortfolioChartPoint, PortfolioChartRange, PortfolioChartSeriesByRange } from "@/lib/types";
import { SegmentedTabs } from "./segmented-tabs";

const chartOptions: Array<{ label: string; range: PortfolioChartRange }> = [
  { label: "1d", range: "1d" },
  { label: "1w", range: "1w" },
  { label: "1month", range: "1month" },
  { label: "ytd", range: "ytd" },
  { label: "all time", range: "all" }
];

const portfolioChartBlue = "#0253c4";

export type PortfolioChartHover = {
  point: PortfolioChartPoint;
  change: number | null;
  changePct: number | null;
  label: string;
} | null;

function hoverLabel(time: number, range: PortfolioChartRange): string {
  const date = new Date(time * 1000);
  if (range === "1d") {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const hhmmFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
const monthDayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthYearFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

/** True when the bucketed points span more than one calendar year (e.g. multi-year "all time"). */
function spansMultipleYears(points: { date: Date }[]): boolean {
  if (points.length === 0) return false;
  const first = points[0]?.date;
  const last = points[points.length - 1]?.date;
  if (!first || !last) return false;
  return first.getFullYear() !== last.getFullYear();
}

/** Picks the x-axis label formatter for a range: HH:mm for 1d, month/day for sub-year windows, month/year when data spans multiple calendar years. */
function axisFormatterForRange(range: PortfolioChartRange, buckets: { date: Date }[]): (date: Date) => string {
  if (range === "1d") {
    return (date: Date) => hhmmFmt.format(date);
  }
  if (spansMultipleYears(buckets)) {
    return (date: Date) => monthYearFmt.format(date);
  }
  return (date: Date) => monthDayFmt.format(date);
}

function fmtCompactUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  if (abs >= 100) return `${sign}$${abs.toFixed(0)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

type ChartPoint = {
  date: Date;
  value: number;
  sourcePoint: PortfolioChartPoint;
};

/** Maps real portfolio points to the area chart's {date, value} shape. Area chart
 * decimates internally (see decimate-time-series.ts), so no manual bucketing needed. */
function toChartPoints(points: PortfolioChartPoint[]): ChartPoint[] {
  return points.map((point) => ({
    date: new Date(point.time * 1000),
    value: point.value,
    sourcePoint: point
  }));
}

/** Reads chart hover state from inside the chart tree and notifies the parent via effect. */
function HoverBridge({
  activeRange,
  firstValue,
  onHoverChange
}: {
  activeRange: PortfolioChartRange;
  firstValue: number | null;
  onHoverChange?: (hover: PortfolioChartHover) => void;
}) {
  const { tooltipData } = useChart();

  useEffect(() => {
    if (!tooltipData) {
      onHoverChange?.(null);
      return;
    }
    const point = tooltipData.point as unknown as { sourcePoint?: PortfolioChartPoint };
    const sourcePoint = point.sourcePoint;
    if (!sourcePoint) {
      onHoverChange?.(null);
      return;
    }
    const change = firstValue != null ? sourcePoint.value - firstValue : null;
    const changePct = firstValue != null && firstValue !== 0 && change != null ? (change / firstValue) * 100 : null;
    onHoverChange?.({
      point: sourcePoint,
      change,
      changePct,
      label: hoverLabel(sourcePoint.time, activeRange)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltipData]);

  return null;
}

export function PortfolioChart({
  seriesByRange,
  onHoverChange
}: {
  seriesByRange: PortfolioChartSeriesByRange;
  onHoverChange?: (hover: PortfolioChartHover) => void;
}) {
  const [activeLabel, setActiveLabel] = useState("1d");
  const activeRange = chartOptions.find((option) => option.label === activeLabel)?.range ?? "1d";
  const points = useMemo(() => seriesByRange[activeRange] ?? [], [activeRange, seriesByRange]);
  const firstValue = points[0]?.value ?? null;

  const chartPoints = useMemo(() => toChartPoints(points), [points]);

  useEffect(() => {
    onHoverChange?.(null);
  }, [activeRange, onHoverChange]);

  const hasData = points.length > 0;

  const axisFormatter = useMemo(() => axisFormatterForRange(activeRange, chartPoints), [activeRange, chartPoints]);

  const tooltipContent = ({ point }: { point: Record<string, unknown> }) => {
    const chartPoint = point as unknown as ChartPoint;
    return (
      <div style={{ padding: "8px 12px" }}>
        <div className="tabular" style={{ fontWeight: 650, fontSize: 13 }}>
          {fmtUsd(chartPoint.value)}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-neutral)" }}>
          {hoverLabel(chartPoint.sourcePoint.time, activeRange)}
        </div>
      </div>
    );
  };

  return (
    <section className="portfolio-chart-section">
      <div className="portfolio-chart-header">
        <p className="section-label">Portfolio chart</p>
        <SegmentedTabs options={chartOptions.map((option) => option.label)} value={activeLabel} onChange={setActiveLabel} />
      </div>
      <div className="portfolio-chart-wrap">
        {hasData ? (
          <div className="bk-chart">
            <AreaChart data={chartPoints} xDataKey="date" style={{ height: 380 }} yDomainMode="data">
              <Grid />
              <Area dataKey="value" stroke={portfolioChartBlue} fill={portfolioChartBlue} />
              <XAxis formatLabel={axisFormatter} />
              <YAxis formatValue={fmtCompactUsd} />
              <ChartTooltip content={tooltipContent} />
              <HoverBridge activeRange={activeRange} firstValue={firstValue} onHoverChange={onHoverChange} />
            </AreaChart>
          </div>
        ) : (
          <div className="chart portfolio-chart" aria-label="Portfolio value chart" />
        )}
      </div>
      {!hasData ? (
        <p className="muted chart-empty">Add active positions with price history or realized PnL to build the chart.</p>
      ) : (
        <p className="subtle chart-footnote">
          Estimated from portfolio inputs, market history, and dated realized PnL.
        </p>
      )}
    </section>
  );
}
