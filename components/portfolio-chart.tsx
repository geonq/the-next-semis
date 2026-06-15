"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  PriceScaleMode,
  createChart,
  type AreaData,
  type ISeriesApi,
  type Time
} from "lightweight-charts";
import { fmtSignedPct, fmtSignedUsd, fmtUsd, signClass } from "@/lib/format";
import type { PortfolioChartPoint, PortfolioChartRange, PortfolioChartSeriesByRange } from "@/lib/types";
import { SegmentedTabs } from "./segmented-tabs";

const chartOptions: Array<{ label: string; range: PortfolioChartRange }> = [
  { label: "live", range: "live" },
  { label: "1d", range: "1d" },
  { label: "1w", range: "1w" },
  { label: "1month", range: "1month" },
  { label: "ytd", range: "ytd" },
  { label: "all time", range: "all" }
];

const portfolioChartBlue = "#2563eb";

function readThemeColors() {
  const style = getComputedStyle(document.documentElement);
  const cssVar = (name: string) => style.getPropertyValue(name).trim();
  return {
    bg: cssVar("--color-bg"),
    grid: cssVar("--color-grid"),
    neutral: cssVar("--color-neutral"),
    accent: cssVar("--color-accent")
  };
}

function rangeStats(points: PortfolioChartPoint[]) {
  const first = points[0]?.value ?? null;
  const last = points.at(-1)?.value ?? null;
  const change = first != null && last != null ? last - first : null;
  const changePct = first != null && first !== 0 && change != null ? (change / first) * 100 : null;
  return { first, last, change, changePct };
}

function chartScaleMode(points: PortfolioChartPoint[]): PriceScaleMode {
  return points.every((point) => point.value > 0) ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal;
}

export function PortfolioChart({
  seriesByRange,
  totalValue
}: {
  seriesByRange: PortfolioChartSeriesByRange;
  totalValue: number;
}) {
  const [activeLabel, setActiveLabel] = useState("live");
  const activeRange = chartOptions.find((option) => option.label === activeLabel)?.range ?? "live";
  const points = useMemo(() => seriesByRange[activeRange] ?? [], [activeRange, seriesByRange]);
  const stats = useMemo(() => rangeStats(points), [points]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  function applySeriesColor(color: string) {
    seriesRef.current?.applyOptions({
      lineColor: color,
      topColor: color + "59",
      bottomColor: color + "0a"
    });
  }

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
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid }
      },
      width: container.clientWidth,
      height: 340,
      handleScroll: false,
      handleScale: false,
      kineticScroll: { mouse: false, touch: false },
      timeScale: {
        timeVisible: activeRange === "live" || activeRange === "1d",
        secondsVisible: false,
        lockVisibleTimeRangeOnResize: true
      },
      rightPriceScale: {
        borderColor: colors.grid,
        borderVisible: false,
        scaleMargins: {
          top: 0.16,
          bottom: 0.16
        }
      }
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: portfolioChartBlue,
      topColor: portfolioChartBlue + "59",
      bottomColor: portfolioChartBlue + "0a",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      const next = readThemeColors();
      chart.applyOptions({
        layout: {
          background: { color: next.bg },
          textColor: next.neutral
        },
        grid: {
          vertLines: { color: next.grid },
          horzLines: { color: next.grid }
        },
        rightPriceScale: {
          borderColor: next.grid,
          borderVisible: false,
          scaleMargins: {
            top: 0.16,
            bottom: 0.16
          }
        }
      });
      applySeriesColor(portfolioChartBlue);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const areaSeries = seriesRef.current;
    if (!chart || !areaSeries) return;

    applySeriesColor(portfolioChartBlue);
    chart.applyOptions({
      timeScale: {
        timeVisible: activeRange === "live" || activeRange === "1d",
        secondsVisible: false
      },
      rightPriceScale: {
        mode: chartScaleMode(points),
        borderVisible: false,
        scaleMargins: {
          top: 0.16,
          bottom: 0.16
        }
      }
    });

    const data: AreaData<Time>[] = points.map((point) => ({
      time: point.time as Time,
      value: point.value
    }));
    areaSeries.setData(data);
    chart.timeScale().fitContent();
  }, [activeRange, points]);

  const hasData = points.length > 0;
  const endingValue = stats.last ?? totalValue;

  return (
    <section className="portfolio-chart-section">
      <div className="portfolio-chart-header">
        <div>
          <p className="section-label">Portfolio chart</p>
          <div className="summary-delta portfolio-chart-delta">
            <span className="ticker tabular">{fmtUsd(endingValue)}</span>
            <span className={`tabular ${signClass(stats.change)}`}>{fmtSignedUsd(stats.change)}</span>
            <span className={`tabular ${signClass(stats.changePct)}`}>{fmtSignedPct(stats.changePct)}</span>
          </div>
        </div>
        <SegmentedTabs options={chartOptions.map((option) => option.label)} value={activeLabel} onChange={setActiveLabel} />
      </div>
      <div className="chart portfolio-chart" ref={containerRef} aria-label="Portfolio value chart" />
      {!hasData ? (
        <p className="muted chart-empty">Add active positions with price history or realized PnL to build the chart.</p>
      ) : (
        <p className="subtle chart-footnote">
          Estimated from active stock/crypto positions and dated realized PnL. Cash is excluded unless tracked as a position.
        </p>
      )}
    </section>
  );
}
