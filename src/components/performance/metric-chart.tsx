"use client";

import { useId, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Table2, LineChart as LineChartIcon } from "lucide-react";

export interface ChartPoint {
  label: string;
  value: number;
}

interface MetricChartProps {
  title: string;
  points: ChartPoint[];
  kind?: "line" | "bar";
  unit?: string;
  valueFormatter?: (value: number) => string;
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = 32;

/**
 * A small, dependency-free, accessible chart (spec section 41) — no chart
 * library was added since a project-wide reusable one didn't already exist
 * and a full one would be overkill for this scope (spec section 53: "evita
 * librerías enormes"). Always renders with a keyboard-reachable "ver como
 * tabla" toggle exposing the exact same data as a real `<table>` — color is
 * never the only way to read a value (every point/bar also has a visible
 * numeric label on hover/focus via <title>, and the table is the
 * screen-reader-friendly source of truth).
 */
export function MetricChart({ title, points, kind = "line", unit, valueFormatter }: MetricChartProps) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const format = valueFormatter ?? ((v: number) => (unit === "PERCENTAGE" ? `${v.toFixed(1)}%` : v.toLocaleString("es-ES")));

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sin datos suficientes para graficar este periodo.</p>;
  }

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const innerWidth = WIDTH - PADDING * 2;
  const innerHeight = HEIGHT - PADDING * 2;

  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: PADDING + (points.length > 1 ? i * xStep : innerWidth / 2),
    y: PADDING + innerHeight - ((p.value - min) / range) * innerHeight,
    ...p,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id={titleId} className="text-sm font-medium">
          {title}
        </h3>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? <LineChartIcon className="size-3.5" /> : <Table2 className="size-3.5" />}
          {showTable ? "Ver gráfico" : "Ver como tabla"}
        </Button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{p.label}</TableCell>
                  <TableCell className="text-right">{format(p.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={titleId} className="h-auto w-full rounded-md border bg-card">
          <line x1={PADDING} y1={PADDING + innerHeight} x2={WIDTH - PADDING} y2={PADDING + innerHeight} className="stroke-border" strokeWidth={1} />
          <line x1={PADDING} y1={PADDING} x2={PADDING} y2={PADDING + innerHeight} className="stroke-border" strokeWidth={1} />

          {kind === "line" ? (
            <>
              <path d={linePath} fill="none" className="stroke-primary" strokeWidth={2} />
              {coords.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r={3} className="fill-primary" tabIndex={0} focusable="true">
                  <title>{`${c.label}: ${format(c.value)}`}</title>
                </circle>
              ))}
            </>
          ) : (
            coords.map((c, i) => {
              const barWidth = Math.max(6, innerWidth / points.length - 8);
              const barHeight = PADDING + innerHeight - c.y;
              return (
                <rect key={i} x={c.x - barWidth / 2} y={c.y} width={barWidth} height={Math.max(0, barHeight)} className="fill-primary" tabIndex={0} focusable="true">
                  <title>{`${c.label}: ${format(c.value)}`}</title>
                </rect>
              );
            })
          )}

          <text x={PADDING} y={16} className="fill-muted-foreground text-[10px]">
            {format(max)}
          </text>
          <text x={PADDING} y={HEIGHT - 6} className="fill-muted-foreground text-[10px]">
            {points[0]?.label}
          </text>
          <text x={WIDTH - PADDING} y={HEIGHT - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {points[points.length - 1]?.label}
          </text>
        </svg>
      )}
    </div>
  );
}
