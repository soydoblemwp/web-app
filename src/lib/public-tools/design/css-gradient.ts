import { parseColor, rgbToHex } from "@/lib/public-tools/color-contrast";

export type GradientType = "linear" | "radial" | "conic" | "repeating-linear" | "repeating-radial" | "repeating-conic";

export interface GradientColorStop {
  color: string;
  alpha: number; // 0-1
  position: number | null; // 0-100, null lets the browser distribute evenly
}

export interface GradientOptions {
  type: GradientType;
  angleDeg: number; // linear/repeating-linear
  shape: "circle" | "ellipse"; // radial
  centerX: number; // 0-100, radial/conic
  centerY: number; // 0-100
  stops: GradientColorStop[];
}

function colorStopToCss(stop: GradientColorStop): string {
  const rgb = parseColor(stop.color) ?? [0, 0, 0];
  const hex = rgbToHex(rgb);
  const colorPart = stop.alpha < 1 ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.round(stop.alpha * 100) / 100})` : hex;
  return stop.position === null ? colorPart : `${colorPart} ${Math.round(stop.position)}%`;
}

/**
 * Builds a real CSS gradient function string. Reuses the shared color
 * parser/formatter (`color-contrast.ts`) instead of a second color
 * implementation (spec section 16: "reutiliza... parser de colores;
 * conversor de colores").
 */
export function buildGradientCss(options: GradientOptions): string {
  const stopsCss = options.stops.map(colorStopToCss).join(", ");

  switch (options.type) {
    case "linear":
    case "repeating-linear":
      return `${options.type}-gradient(${Math.round(options.angleDeg)}deg, ${stopsCss})`;
    case "radial":
    case "repeating-radial":
      return `${options.type}-gradient(${options.shape} at ${Math.round(options.centerX)}% ${Math.round(options.centerY)}%, ${stopsCss})`;
    case "conic":
    case "repeating-conic":
      return `${options.type}-gradient(from ${Math.round(options.angleDeg)}deg at ${Math.round(options.centerX)}% ${Math.round(options.centerY)}%, ${stopsCss})`;
    default:
      return "";
  }
}

export function buildGradientDeclaration(options: GradientOptions): string {
  return `background: ${buildGradientCss(options)};`;
}

/** Structural validation of the generated gradient string — never a full CSS parser, just enough to confirm the function name, balanced parentheses, and at least 2 comma-separated stops are present (spec section 16: "valida la salida mediante un parser o comprobación estructural"). */
export function isStructurallyValidGradientCss(css: string): boolean {
  const match = /^((?:repeating-)?(?:linear|radial|conic))-gradient\((.*)\)$/.exec(css.trim());
  if (!match) return false;
  const inner = match[2];
  if ((inner.match(/\(/g) ?? []).length !== (inner.match(/\)/g) ?? []).length) return false;
  const topLevelCommaCount = countTopLevelCommas(inner);
  return topLevelCommaCount >= 1; // at least 2 segments (angle/shape + stops, or 2 stops)
}

function countTopLevelCommas(text: string): number {
  let depth = 0;
  let count = 0;
  for (const char of text) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) count++;
  }
  return count;
}

export const GRADIENT_PRESETS: { name: string; options: GradientOptions }[] = [
  { name: "Atardecer", options: { type: "linear", angleDeg: 135, shape: "circle", centerX: 50, centerY: 50, stops: [{ color: "#ff512f", alpha: 1, position: 0 }, { color: "#f09819", alpha: 1, position: 100 }] } },
  { name: "Océano", options: { type: "linear", angleDeg: 120, shape: "circle", centerX: 50, centerY: 50, stops: [{ color: "#2193b0", alpha: 1, position: 0 }, { color: "#6dd5ed", alpha: 1, position: 100 }] } },
  { name: "Radial suave", options: { type: "radial", angleDeg: 0, shape: "circle", centerX: 50, centerY: 50, stops: [{ color: "#ffffff", alpha: 1, position: 0 }, { color: "#a1c4fd", alpha: 1, position: 100 }] } },
  { name: "Cónico", options: { type: "conic", angleDeg: 0, shape: "circle", centerX: 50, centerY: 50, stops: [{ color: "#ff9a9e", alpha: 1, position: 0 }, { color: "#fad0c4", alpha: 1, position: 50 }, { color: "#ff9a9e", alpha: 1, position: 100 }] } },
];
