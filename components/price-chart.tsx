"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, createChart, type AreaData, type ISeriesApi, type Time } from "lightweight-charts";
import type { Candle } from "@/lib/types";
import { useBrandColor } from "./use-brand-color";

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

export function PriceChart({ history, ticker, company }: { history: Candle[]; ticker: string; company: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const brandColorRef = useRef<string | null>(null);
  const brandColor = useBrandColor(ticker, company);

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
      height: 380,
      handleScroll: false,
      handleScale: false,
      timeScale: {
        timeVisible: false,
        secondsVisible: false,
        lockVisibleTimeRangeOnResize: true
      },
      rightPriceScale: { borderColor: colors.grid }
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: colors.accent,
      topColor: colors.accent + "59",
      bottomColor: colors.accent + "0a",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });

    chartRef.current = chart;
    seriesRef.current = series;

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
        rightPriceScale: { borderColor: next.grid }
      });
      applySeriesColor(brandColorRef.current ?? next.accent);
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
    const series = seriesRef.current;
    if (!series || history.length === 0) return;
    const data: AreaData<Time>[] = history.map((c) => ({ time: c.time as Time, value: c.close }));
    series.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [history]);

  useEffect(() => {
    brandColorRef.current = brandColor;
    applySeriesColor(brandColor ?? readThemeColors().accent);
  }, [brandColor]);

  return (
    <div className="chart-section">
      <div className="chart" ref={containerRef} />
    </div>
  );
}
