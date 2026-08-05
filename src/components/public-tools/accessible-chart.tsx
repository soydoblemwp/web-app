/**
 * A minimal, dependency-free bar/line chart shared by every Fase 48 tool
 * that visualizes a result series (break-even cost/revenue lines, ROI cash
 * flow, inventory position, GPA per period, recipe cost breakdown, appliance
 * consumption). No charting library exists yet in this project (spec section
 * 26: "no añadas una biblioteca pesada si ya existe una librería reutilizable
 * ... si no existe, utiliza SVG o Canvas controlado"), so this is a small
 * controlled SVG renderer — never the visitor's own text, never
 * `dangerouslySetInnerHTML`.
 *
 * The chart is always paired with a real, visible `<table>` of the same
 * data (spec section 26: "debe... incluir tabla... no ser la única forma de
 * comunicar resultados") — the SVG is marked `aria-hidden`, the table is the
 * accessible source of truth for screen readers and keyboard users.
 */
export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
}

interface AccessibleChartProps {
  title: string;
  type: "bar" | "line";
  series: ChartSeries[];
  /** Formats a raw value for both the SVG labels and the table cells — keeps units/currency consistent between the two. */
  valueFormatter?: (value: number) => string;
  height?: number;
}

const WIDTH = 600;

export function AccessibleChart({ title, type, series, valueFormatter = (v) => v.toLocaleString("es-ES"), height = 240 }: AccessibleChartProps) {
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const allValues = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => Number.isFinite(v));
  const maxValue = Math.max(0, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const range = maxValue - minValue || 1;
  const padding = 32;
  const plotWidth = WIDTH - padding * 2;
  const plotHeight = height - padding * 2;

  function yFor(value: number): number {
    return padding + plotHeight - ((value - minValue) / range) * plotHeight;
  }
  function xFor(index: number, count: number): number {
    if (count <= 1) return padding + plotWidth / 2;
    return padding + (index / (count - 1)) * plotWidth;
  }

  const zeroY = yFor(0);

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-full max-w-full" role="img" aria-hidden="true" focusable="false">
        <line x1={padding} y1={zeroY} x2={WIDTH - padding} y2={zeroY} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
        {series.map((s) => {
          if (type === "bar") {
            const barWidth = Math.min(28, plotWidth / Math.max(1, s.points.length) / (series.length + 1));
            return (
              <g key={s.name}>
                {s.points.map((p, i) => {
                  if (!Number.isFinite(p.value)) return null; // never render a non-finite value (spec: los gráficos omiten valores no finitos)
                  const x = xFor(i, s.points.length) - barWidth / 2;
                  const y = Math.min(yFor(p.value), zeroY);
                  const barHeight = Math.abs(yFor(p.value) - zeroY);
                  return <rect key={p.label} x={x} y={y} width={barWidth} height={barHeight} fill={s.color} rx={2} />;
                })}
              </g>
            );
          }
          const finitePoints = s.points.map((p, i) => ({ p, i })).filter(({ p }) => Number.isFinite(p.value));
          const path = finitePoints.map(({ p, i }, order) => `${order === 0 ? "M" : "L"} ${xFor(i, s.points.length)} ${yFor(p.value)}`).join(" ");
          return (
            <g key={s.name}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} />
              {finitePoints.map(({ p, i }) => (
                <circle key={p.label} cx={xFor(i, s.points.length)} cy={yFor(p.value)} r={2.5} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[420px] text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {series.length > 1 || type === "line" ? "Periodo" : "Elemento"}
              </th>
              {series.map((s) => (
                <th key={s.name} scope="col" className="px-3 py-2 text-right font-medium">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label} className="border-b last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">
                  {label}
                </th>
                {series.map((s) => {
                  const value = s.points[i]?.value;
                  return (
                    <td key={s.name} className="px-3 py-2 text-right tabular-nums">
                      {Number.isFinite(value) ? valueFormatter(value as number) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
