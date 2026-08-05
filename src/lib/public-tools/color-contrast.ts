export type RgbTuple = [number, number, number];

/** Also used directly (not just internally) by the WCAG contrast-checker tool — kept exported rather than re-implemented there. */
export function hexToRgb(hex: string): RgbTuple | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex.trim());
  if (!match) return null;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

export function rgbToHex([r, g, b]: RgbTuple): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

export function hslToRgb(h: number, s: number, l: number): RgbTuple {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;

  if (sat === 0) {
    const gray = Math.round(light * 255);
    return [gray, gray, gray];
  }

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let [r1, g1, b1] = [0, 0, 0];
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/** Parses a color given as HEX (#rrggbb / #rgb), rgb()/rgba(), or hsl()/hsla() into an RGB tuple, or null if unrecognized. */
export function parseColor(raw: string): RgbTuple | null {
  const value = raw.trim();

  const hexShort = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(value);
  if (hexShort) {
    return [parseInt(hexShort[1] + hexShort[1], 16), parseInt(hexShort[2] + hexShort[2], 16), parseInt(hexShort[3] + hexShort[3], 16)];
  }

  const hex = hexToRgb(value);
  if (hex) return hex;

  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(value);
  if (rgbMatch) {
    const [r, g, b] = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
    if ([r, g, b].every((v) => v >= 0 && v <= 255)) return [r, g, b];
    return null;
  }

  const hslMatch = /^hsla?\(\s*(-?[\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(value);
  if (hslMatch) {
    return hslToRgb(Number(hslMatch[1]), Number(hslMatch[2]), Number(hslMatch[3]));
  }

  return null;
}

export function relativeLuminance([r, g, b]: RgbTuple): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const channel = c / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG-style contrast ratio (1-21) between two hex colors, used to warn about low-contrast QR codes that scanners may fail to read, and reused directly by the WCAG contrast-checker public tool. */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return null;
  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast ratio between two arbitrary RGB tuples (not necessarily parsed from hex) — used by the contrast-checker tool, which accepts HEX/RGB/HSL input. */
export function contrastRatioRgb(a: RgbTuple, b: RgbTuple): number {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface WcagLevels {
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

/**
 * WCAG 2.2 thresholds (spec section 21): AA normal text 4.5:1, AA large
 * text 3:1, AAA normal text 7:1, AAA large text 4.5:1. Compares the exact
 * unrounded ratio — never rounds before determining pass/fail (spec: "no
 * redondees antes de determinar aprobación").
 */
export function evaluateWcagLevels(ratio: number): WcagLevels {
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

/**
 * Searches for the smallest lightness adjustment (in HSL) to `foreground`
 * that reaches `targetRatio` against `background`, moving toward either
 * white or black. Returns null if even the extreme (white/black) doesn't
 * reach the target — an honest "no result" rather than a fabricated color.
 */
export function suggestAdjustedColor(foreground: RgbTuple, background: RgbTuple, targetRatio: number, direction: "lighter" | "darker"): RgbTuple | null {
  const bgLum = relativeLuminance(background);
  const [r, g, b] = foreground;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l0 = (max + min) / 2;

  // Binary search on lightness toward 1 (lighter) or 0 (darker), reusing the color's own hue/saturation.
  const hsl = rgbToHslLocal(foreground);
  let lo = direction === "lighter" ? l0 : 0;
  let hi = direction === "lighter" ? 1 : l0;

  const meetsTarget = (l: number): boolean => {
    const candidate = hslToRgb(hsl.h, hsl.s, l * 100);
    return contrastRatioRgb(candidate, background) >= targetRatio || relativeLuminance(candidate) === bgLum;
  };

  const extreme = direction === "lighter" ? hslToRgb(hsl.h, hsl.s, 100) : hslToRgb(hsl.h, hsl.s, 0);
  if (contrastRatioRgb(extreme, background) < targetRatio) return null;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const candidate = hslToRgb(hsl.h, hsl.s, mid * 100);
    const ratio = contrastRatioRgb(candidate, background);
    if (ratio >= targetRatio) {
      if (direction === "lighter") hi = mid;
      else lo = mid;
    } else {
      if (direction === "lighter") lo = mid;
      else hi = mid;
    }
  }
  void meetsTarget;
  const finalL = direction === "lighter" ? hi : lo;
  return hslToRgb(hsl.h, hsl.s, finalL * 100);
}

function rgbToHslLocal([r, g, b]: RgbTuple): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}
