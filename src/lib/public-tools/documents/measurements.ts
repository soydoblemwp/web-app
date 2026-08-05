/**
 * Shared physical-unit math for every printable document (spec section 13:
 * "medidas"). PDF/canvas space is always PostScript points (72 pt = 1 in) —
 * every other unit converts through that single constant, never a second
 * hand-rolled conversion per tool.
 */
export const POINTS_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

export function mmToPoints(mm: number): number {
  return (mm / MM_PER_INCH) * POINTS_PER_INCH;
}

export function pointsToMm(points: number): number {
  return (points / POINTS_PER_INCH) * MM_PER_INCH;
}

export function inchesToPoints(inches: number): number {
  return inches * POINTS_PER_INCH;
}

/** [width, height] in points — the same tuple shape pdf-lib's own PageSizes uses. */
export type PageSizePt = [number, number];

// pdf-lib already exports PageSizes.A4/Letter/Legal for full sheets; these are
// the additional small/custom sizes Fase 47 needs (cards, labels) that pdf-lib
// doesn't provide.
export const PAGE_SIZES_PT = {
  A4: [mmToPoints(210), mmToPoints(297)] as PageSizePt,
  LETTER: [inchesToPoints(8.5), inchesToPoints(11)] as PageSizePt,
  BUSINESS_CARD_US: [inchesToPoints(3.5), inchesToPoints(2)] as PageSizePt,
  BUSINESS_CARD_EU: [mmToPoints(85), mmToPoints(55)] as PageSizePt,
} as const;

export function clampCustomSizeMm(widthMm: number, heightMm: number, min = 10, max = 500): PageSizePt {
  const w = Math.min(Math.max(widthMm, min), max);
  const h = Math.min(Math.max(heightMm, min), max);
  return [mmToPoints(w), mmToPoints(h)];
}
