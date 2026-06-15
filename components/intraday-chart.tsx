"use client";

import { useEffect, useRef, useState } from "react";
import type { PortfolioChartPoint } from "@/lib/types";

type HoverInfo = { point: PortfolioChartPoint; x: number };

type Props = {
  points: PortfolioChartPoint[];
  color: string;
  height?: number;
  onHover?: (info: HoverInfo | null) => void;
};

export function IntradayChart({ points, color, height = 340, onHover }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgWidth, setSvgWidth] = useState(640);
  const [crosshairX, setCrosshairX] = useState<number | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setSvgWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset crosshair when points change (range switch)
  useEffect(() => {
    setCrosshairX(null);
    onHover?.(null);
  }, [points]);

  if (points.length < 2) {
    return <svg ref={svgRef} style={{ width: "100%", height, display: "block" }} />;
  }

  const PAD_TOP = 10;
  const PAD_BOTTOM = 4;
  const W = svgWidth;
  const H = height;

  const tMin = points[0].time;
  const tMax = points[points.length - 1].time;
  const tSpan = tMax - tMin || 1;

  const values = points.map((p) => p.value);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const vPad = (vMax - vMin) * 0.06;
  const vLo = vMin - vPad;
  const vHi = vMax + vPad;
  const vSpan = vHi - vLo || 1;

  const xOf = (t: number) => ((t - tMin) / tSpan) * W;
  const yOf = (v: number) => PAD_TOP + (1 - (v - vLo) / vSpan) * (H - PAD_TOP - PAD_BOTTOM);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.time).toFixed(1)},${yOf(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${W.toFixed(1)},${H} L0,${H} Z`;

  const gradId = `ig-${color.replace(/[^a-z0-9]/gi, "")}`;

  function findNearest(clientX: number): { point: PortfolioChartPoint; x: number } | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = clientX - rect.left;
    const t = tMin + (px / W) * tSpan;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].time < t) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(points[lo - 1].time - t) < Math.abs(points[lo].time - t)) lo -= 1;
    return { point: points[lo], x: xOf(points[lo].time) };
  }

  return (
    <svg
      ref={svgRef}
      style={{ width: "100%", height, display: "block", cursor: "crosshair" }}
      onMouseMove={(e) => {
        const hit = findNearest(e.clientX);
        if (!hit) return;
        setCrosshairX(hit.x);
        onHover?.(hit);
      }}
      onMouseLeave={() => {
        setCrosshairX(null);
        onHover?.(null);
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {crosshairX != null && (
        <line
          x1={crosshairX.toFixed(1)}
          y1={PAD_TOP}
          x2={crosshairX.toFixed(1)}
          y2={H}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.5}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  );
}
