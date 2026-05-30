"use client";

import { useEffect, useRef, useState } from "react";
import { AreaSeries, createChart, type AreaData, type ISeriesApi, type Time } from "lightweight-charts";
import type { Candle } from "@/lib/types";

const RANGES = [
  { label: "1M", value: "1mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "5Y", value: "5y" },
  { label: "Max", value: "max" },
];

export function PriceChart({ history: initialHistory, ticker }: { history: Candle[]; ticker: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = useState("5y");
  const [history, setHistory] = useState(initialHistory);
  const didMount = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const style = getComputedStyle(document.documentElement);
    const cssVar = (name: string) => style.getPropertyValue(name).trim();
    const accent = cssVar("--color-accent");

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
      lineColor: accent,
      topColor: accent + "33",
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
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    let cancelled = false;
    fetch(`/api/history/${ticker}?range=${range}`)
      .then((r) => r.json())
      .then((data: Candle[]) => {
        if (!cancelled) setHistory(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [range, ticker]);

  return (
    <div className="chart-section">
      <div className="range-picker">
        {RANGES.map((r) => (
          <button
            key={r.value}
            className={`chip${range === r.value ? " active" : ""}`}
            onClick={() => setRange(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="chart" ref={containerRef} />
    </div>
  );
}
