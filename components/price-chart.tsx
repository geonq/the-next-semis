"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart, type CandlestickData, type Time } from "lightweight-charts";
import type { Candle } from "@/lib/types";

export function PriceChart({ history }: { history: Candle[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

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
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: cssVar("--color-grid") }
    });

    const gain = cssVar("--color-gain");
    const loss = cssVar("--color-loss");
    const series = chart.addSeries(CandlestickSeries, {
      upColor: gain,
      downColor: loss,
      borderUpColor: gain,
      borderDownColor: loss,
      wickUpColor: gain,
      wickDownColor: loss
    });

    if (history.length > 0) {
      series.setData(history as CandlestickData<Time>[]);
      chart.timeScale().fitContent();
    }

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [history]);

  return <div className="chart" ref={containerRef} />;
}
