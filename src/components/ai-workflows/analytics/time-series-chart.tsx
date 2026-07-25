"use client";

import { useMemo } from "react";

export interface TimeSeriesChartPoint {
  bucketStart: string;
  total: number;
  completed: number;
  failed: number;
}

const WIDTH = 600;
const HEIGHT = 200;
const PADDING = 28;
const MAX_LABELS = 6;

function formatLabel(iso: string, granularity: "hour" | "day" | "week"): string {
  const date = new Date(iso);
  if (granularity === "hour") return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

function pathFor(values: number[], max: number): string {
  if (values.length === 0) return "";
  const stepX = values.length > 1 ? (WIDTH - PADDING * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = PADDING + i * stepX;
      const y = max > 0 ? HEIGHT - PADDING - (v / max) * (HEIGHT - PADDING * 2) : HEIGHT - PADDING;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Lightweight, dependency-free SVG line chart — no charting library, since
 * none exists in this project yet and the data volume (a handful of time
 * buckets) doesn't warrant one. Renders total/completed/failed as three
 * lines over a shared scale. Long axis labels are thinned to at most
 * MAX_LABELS entries so they never overlap regardless of how many buckets
 * the selected period produced.
 */
export function TimeSeriesChart({
  points,
  granularity,
}: {
  points: TimeSeriesChartPoint[];
  granularity: "hour" | "day" | "week";
}) {
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.total)), [points]);

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No hay datos en este periodo.</p>;
  }

  const totalPath = pathFor(points.map((p) => p.total), max);
  const completedPath = pathFor(points.map((p) => p.completed), max);
  const failedPath = pathFor(points.map((p) => p.failed), max);

  const labelStep = Math.max(1, Math.ceil(points.length / MAX_LABELS));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-56 w-full min-w-[420px]" role="img" aria-label="Ejecuciones en el tiempo">
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} className="stroke-border" strokeWidth={1} />
        <path d={totalPath} fill="none" className="stroke-muted-foreground" strokeWidth={2} />
        <path d={completedPath} fill="none" stroke="#10b981" strokeWidth={2} />
        <path d={failedPath} fill="none" stroke="#ef4444" strokeWidth={2} />
        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <text
              key={p.bucketStart}
              x={PADDING + (points.length > 1 ? (i * (WIDTH - PADDING * 2)) / (points.length - 1) : 0)}
              y={HEIGHT - PADDING + 14}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {formatLabel(p.bucketStart, granularity)}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <LegendItem colorClassName="bg-muted-foreground" label="Total" />
        <LegendItem color="#10b981" label="Completadas" />
        <LegendItem color="#ef4444" label="Fallidas" />
      </div>
    </div>
  );
}

function LegendItem({ color, colorClassName, label }: { color?: string; colorClassName?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block size-2 rounded-full ${colorClassName ?? ""}`} style={color ? { backgroundColor: color } : undefined} />
      {label}
    </span>
  );
}
