"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  createChart,
  type AreaData,
  type ISeriesApi,
  type MouseEventParams,
  type Time
} from "lightweight-charts";
import { fmtUsd } from "@/lib/format";
import type { PortfolioChartPoint, PortfolioChartRange, PortfolioChartSeriesByRange } from "@/lib/types";
import { SegmentedTabs } from "./segmented-tabs";
import { IntradayChart } from "./intraday-chart";

const chartOptions: Array<{ label: string; range: PortfolioChartRange }> = [
  { label: "live", range: "live" },
  { label: "1d", range: "1d" },
  { label: "1w", range: "1w" },
  { label: "1month", range: "1month" },
  { label: "ytd", range: "ytd" },
  { label: "all time", range: "all" }
];

const portfolioChartBlue = "#2563eb";

export type PortfolioChartHover = {
  point: PortfolioChartPoint;
  change: number | null;
  changePct: number | null;
  label: string;
} | null;

function readThemeColors() {
  const style = getComputedStyle(document.documentElement);
  const cssVar = (name: string) => style.getPropertyValue(name).trim();
  return {
    bg: cssVar("--color-bg"),
    neutral: cssVar("--color-neutral"),
    grid: cssVar("--color-grid")
  };
}

function chartData(points: PortfolioChartPoint[]): AreaData<Time>[] {
  const base = points.find((point) => point.value !== 0)?.value ?? 0;
  return points.map((point) => ({
    time: point.time as Time,
    value: base === 0 ? point.value : ((point.value - base) / Math.abs(base)) * 100
  }));
}

function hoverLabel(time: number, range: PortfolioChartRange): string {
  const date = new Date(time * 1000);
  if (range === "live" || range === "1d") {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PortfolioChart({
  seriesByRange,
  onHoverChange
}: {
  seriesByRange: PortfolioChartSeriesByRange;
  onHoverChange?: (hover: PortfolioChartHover) => void;
}) {
  const [activeLabel, setActiveLabel] = useState("live");
  const activeRange = chartOptions.find((option) => option.label === activeLabel)?.range ?? "live";
  const isIntraday = activeRange === "live" || activeRange === "1d";
  const points = useMemo(() => seriesByRange[activeRange] ?? [], [activeRange, seriesByRange]);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const pointsByTimeRef = useRef<Map<number, PortfolioChartPoint>>(new Map());
  const rangeFirstValueRef = useRef<number | null>(null);
  const activeRangeRef = useRef<PortfolioChartRange>(activeRange);
  const [tooltip, setTooltip] = useState<{ x: number; label: string; point: PortfolioChartPoint } | null>(null);

  function applySeriesColor(color: string) {
    seriesRef.current?.applyOptions({
      lineColor: color,
      topColor: color + "59",
      bottomColor: color + "0a"
    });
  }

  // TradingView chart — only active for non-intraday ranges
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const colors = readThemeColors();
    const chart = createChart(container, {
      layout: {
        background: { color: colors.bg },
        textColor: colors.neutral
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false }
      },
      width: container.clientWidth,
      height: 340,
      handleScroll: false,
      handleScale: false,
      kineticScroll: { mouse: false, touch: false },
      timeScale: {
        timeVisible: false,
        secondsVisible: false,
        lockVisibleTimeRangeOnResize: true
      },
      rightPriceScale: {
        borderVisible: false,
        visible: false,
        scaleMargins: { top: 0.08, bottom: 0.08 }
      }
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: portfolioChartBlue,
      topColor: portfolioChartBlue + "59",
      bottomColor: portfolioChartBlue + "0a",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      const pt = param.point;
      const time = typeof param.time === "number" ? param.time : null;
      if (!pt || time == null || pt.x < 0 || pt.x > container.clientWidth || pt.y < 0 || pt.y > container.clientHeight) {
        setTooltip(null);
        onHoverChange?.(null);
        return;
      }
      const hovered = pointsByTimeRef.current.get(time);
      if (!hovered) { setTooltip(null); onHoverChange?.(null); return; }
      const first = rangeFirstValueRef.current;
      const change = first != null ? hovered.value - first : null;
      const changePct = first != null && first !== 0 && change != null ? (change / first) * 100 : null;
      const label = hoverLabel(hovered.time, activeRangeRef.current);
      const x = Math.min(Math.max(pt.x, 74), Math.max(container.clientWidth - 74, 74));
      setTooltip({ x, label, point: hovered });
      onHoverChange?.({ point: hovered, change, changePct, label });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      const next = readThemeColors();
      chart.applyOptions({
        layout: { background: { color: next.bg }, textColor: next.neutral },
        rightPriceScale: { borderVisible: false, visible: false, scaleMargins: { top: 0.08, bottom: 0.08 } }
      });
      applySeriesColor(portfolioChartBlue);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Sync TradingView data when range/points change (only used for non-intraday)
  useEffect(() => {
    rangeFirstValueRef.current = points[0]?.value ?? null;
    activeRangeRef.current = activeRange;
    setTooltip(null);
    onHoverChange?.(null);

    if (isIntraday) return;

    const chart = chartRef.current;
    const areaSeries = seriesRef.current;
    if (!chart || !areaSeries) return;

    pointsByTimeRef.current = new Map(points.map((point) => [point.time, point]));
    applySeriesColor(portfolioChartBlue);
    chart.applyOptions({
      timeScale: { timeVisible: false, secondsVisible: false },
      rightPriceScale: { borderVisible: false, visible: false, scaleMargins: { top: 0.08, bottom: 0.08 } }
    });
    areaSeries.setData(chartData(points));
    chart.timeScale().fitContent();
  }, [activeRange, points, isIntraday]);

  const hasData = points.length > 0;

  return (
    <section className="portfolio-chart-section">
      <div className="portfolio-chart-header">
        <p className="section-label">Portfolio chart</p>
        <SegmentedTabs options={chartOptions.map((option) => option.label)} value={activeLabel} onChange={setActiveLabel} />
      </div>
      <div className="portfolio-chart-wrap" ref={wrapRef}>
        {isIntraday ? (
          <IntradayChart
            points={points}
            color={portfolioChartBlue}
            height={340}
            onHover={(info) => {
              if (!info) { setTooltip(null); onHoverChange?.(null); return; }
              const first = rangeFirstValueRef.current;
              const change = first != null ? info.point.value - first : null;
              const changePct = first != null && first !== 0 && change != null ? (change / first) * 100 : null;
              const label = hoverLabel(info.point.time, activeRange);
              const wrapWidth = wrapRef.current?.clientWidth ?? 640;
              const x = Math.min(Math.max(info.x, 74), Math.max(wrapWidth - 74, 74));
              setTooltip({ x, label, point: info.point });
              onHoverChange?.({ point: info.point, change, changePct, label });
            }}
          />
        ) : (
          <div className="chart portfolio-chart" ref={containerRef} aria-label="Portfolio value chart" />
        )}
        {tooltip ? (
          <div className="portfolio-chart-tooltip" style={{ left: `${tooltip.x}px` }}>
            <span className="tabular">{fmtUsd(tooltip.point.value)}</span>
            <span>{tooltip.label}</span>
          </div>
        ) : null}
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
