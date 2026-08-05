/**
 * Central rounding policy for every finance tool (loans, compound interest,
 * work-hours pay). Money is tracked as an integer number of minor units
 * (cents) internally — never as a running floating-point decimal — so that
 * long amortization tables don't accumulate rounding error (spec section 9:
 * "evita acumulación de errores en tablas largas"). `toFixed()` is used only
 * in `formatMoney`, purely for display.
 */
export const MINOR_UNITS_PER_MAJOR = 100;

/** Converts a major-unit amount (e.g. dollars) to an integer count of minor units (cents), rounding once at this single explicit boundary. */
export function toMinorUnits(majorAmount: number): number {
  return Math.round(majorAmount * MINOR_UNITS_PER_MAJOR);
}

export function fromMinorUnits(minorUnits: number): number {
  return minorUnits / MINOR_UNITS_PER_MAJOR;
}

/**
 * Real bug found by its own test: mixing `es-ES` thousands grouping (which
 * uses "." for grouping) with a hardcoded "." decimal separator produced
 * ambiguous output like "$1.999.00" (two periods, unclear which is which).
 * Uses `en-US` grouping (comma thousands) so it's unambiguous alongside the
 * hardcoded "." decimal point — this function only ever formats an amount
 * for display, never for a further calculation.
 */
export function formatMoney(minorUnits: number, currencySymbol = "$"): string {
  const negative = minorUnits < 0;
  const abs = Math.abs(minorUnits);
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const minor = abs % MINOR_UNITS_PER_MAJOR;
  const majorText = major.toLocaleString("en-US");
  return `${negative ? "-" : ""}${currencySymbol}${majorText}.${String(minor).padStart(2, "0")}`;
}

/** Distributes an integer total across `count` integer shares as evenly as possible (e.g. splitting a final payment's rounding remainder), so the sum of shares always equals `total` exactly — never leaves a stray cent from independent rounding. */
export function distributeMinorUnits(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
