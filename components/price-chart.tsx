"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, createChart, type AreaData, type ISeriesApi, type Time } from "lightweight-charts";
import type { Candle } from "@/lib/types";

const FALLBACK_COLOR = "#ffffff";

export function PriceChart({ history, ticker, company }: { history: Candle[]; ticker: string; company: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const style = getComputedStyle(document.documentElement);
    const cssVar = (name: string) => style.getPropertyValue(name).trim();

    const chart = createChart(container, {
      layout: {
        background: { color: cssVar("--color-bg") },
        textColor: cssVar("--color-neutral")
      },
      grid: {
        vertLines: { color: cssVar("--color-grid") },
        horzLines: { color: cssVar("--color-grid") }
      },
      width: container.clientWidth,
      height: 380,
      timeScale: { timeVisible: false, secondsVisible: false },
      rightPriceScale: { borderColor: cssVar("--color-grid") }
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: FALLBACK_COLOR,
      topColor: FALLBACK_COLOR + "22",
      bottomColor: "transparent",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
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
        if (cancelled || !seriesRef.current) return;
        const c = color ?? FALLBACK_COLOR;
        seriesRef.current.applyOptions({
          lineColor: c,
          topColor: c + "22",
          bottomColor: "transparent"
        });
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
