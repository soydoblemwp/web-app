/**
 * Timesheet math. No labor-law assumption is baked in — overtime threshold
 * and multiplier are always explicit inputs (spec section 15: "no asumas
 * una ley laboral concreta").
 */
export interface Shift {
  id: string;
  day: string; // free-form label (e.g. an ISO date or "Lunes") — grouping key only, not parsed as a Date
  label?: string;
  project?: string;
  startMinutes: number; // minutes since midnight [0, 1440)
  endMinutes: number; // minutes since midnight [0, 1440)
  unpaidBreakMinutes: number;
  paidBreakMinutes: number;
  hourlyRate?: number; // overrides the global rate for this shift when set
}

export interface ShiftHours {
  grossMinutes: number;
  netMinutes: number;
  crossesMidnight: boolean;
}

/** A shift is treated as crossing midnight only when end < start (strictly) — start === end is always zero duration, never a silent 24h shift. */
export function computeShiftHours(shift: Shift): ShiftHours {
  let duration = shift.endMinutes - shift.startMinutes;
  const crossesMidnight = duration < 0;
  if (crossesMidnight) duration += 24 * 60;
  const netMinutes = Math.max(0, duration - shift.unpaidBreakMinutes);
  return { grossMinutes: duration, netMinutes, crossesMidnight };
}

export interface WorkHoursOptions {
  overtimeEnabled: boolean;
  overtimeThresholdHours: number;
  overtimeMultiplier: number;
  defaultHourlyRate: number;
}

export interface DaySummary {
  day: string;
  netMinutes: number;
  shiftCount: number;
}

export interface WeekSummary {
  totalNetMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  regularPay: number;
  overtimePay: number;
  totalPay: number;
  days: DaySummary[];
}

export function summarizeWeek(shifts: Shift[], options: WorkHoursOptions): WeekSummary {
  const thresholdMinutes = options.overtimeEnabled ? options.overtimeThresholdHours * 60 : Infinity;

  let totalNetMinutes = 0;
  let totalPay = 0;
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let regularPay = 0;
  let overtimePay = 0;
  const dayTotals = new Map<string, { minutes: number; count: number }>();

  for (const shift of shifts) {
    const { netMinutes } = computeShiftHours(shift);
    totalNetMinutes += netMinutes;
    const entry = dayTotals.get(shift.day) ?? { minutes: 0, count: 0 };
    entry.minutes += netMinutes;
    entry.count += 1;
    dayTotals.set(shift.day, entry);
  }

  const regularPortion = Math.min(totalNetMinutes, thresholdMinutes);
  const overtimePortion = Math.max(0, totalNetMinutes - thresholdMinutes);
  regularMinutes = regularPortion;
  overtimeMinutes = overtimePortion;

  // Pay is computed per-shift (respecting any shift-level rate override), proportionally
  // allocating the week's regular/overtime split across shifts in the order they were entered.
  let regularRemaining = regularPortion;
  for (const shift of shifts) {
    const { netMinutes } = computeShiftHours(shift);
    const rate = shift.hourlyRate ?? options.defaultHourlyRate;
    const regularForShift = Math.min(netMinutes, regularRemaining);
    const overtimeForShift = netMinutes - regularForShift;
    regularRemaining -= regularForShift;
    regularPay += (regularForShift / 60) * rate;
    overtimePay += (overtimeForShift / 60) * rate * options.overtimeMultiplier;
  }
  totalPay = regularPay + overtimePay;

  const days: DaySummary[] = Array.from(dayTotals.entries()).map(([day, v]) => ({ day, netMinutes: v.minutes, shiftCount: v.count }));

  return { totalNetMinutes, regularMinutes, overtimeMinutes, regularPay, overtimePay, totalPay, days };
}

export function formatMinutesAsHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
