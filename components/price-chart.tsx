"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, createChart, type AreaData, type ISeriesApi, type Time } from "lightweight-charts";
import type { Candle } from "@/lib/types";

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

export function PriceChart({ history, company }: { history: Candle[]; ticker: string; company: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const brandColorRef = useRef<string | null>(null);

  function applySeriesColor(color: string) {
    seriesRef.current?.applyOptions({
      lineColor: color,
      topColor: color + "22",
      bottomColor: "transparent"
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
      topColor: colors.accent + "22",
      bottomColor: "transparent",
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
    if (!company) return;
    let cancelled = false;
    fetch(`/api/brand-color?company=${encodeURIComponent(company)}`)
      .then((r) => r.json())
      .then(({ color }: { color: string | null }) => {
        if (cancelled) return;
        brandColorRef.current = color;
        applySeriesColor(color ?? readThemeColors().accent);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [company]);

  return (
    <div className="chart-section">
      <div className="chart" ref={containerRef} />
    </div>
  );
}
