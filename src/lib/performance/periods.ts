import { getZonedParts, zonedWallTimeToUtc } from "@/lib/automations/recurrence";
import type { PerformancePeriodGranularity } from "@/lib/performance/types";

/**
 * Period bucketing (spec section 10) — reuses the exact same DST-safe
 * Intl.DateTimeFormat technique already built and tested for AI Automation
 * Center's recurrence engine, rather than a second timezone implementation.
 * All storage stays UTC; only display/grouping respects the project's or
 * user's timezone — grouping "by day" must never silently fall back to UTC
 * when the interface is showing local time (spec section 10).
 */

/** The calendar-day key ("YYYY-MM-DD") a UTC instant falls on when read in the given IANA timezone — the stable bucketing key for "group by local day". */
export function zonedDayKey(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export interface PeriodBounds {
  start: Date;
  end: Date;
}

/** Start/end (UTC instants) of the calendar period a reference date falls into, computed in the given timezone — e.g. "this week" always starts Monday 00:00 LOCAL time, not UTC. */
export function getPeriodBounds(granularity: PerformancePeriodGranularity, referenceDate: Date, timeZone: string): PeriodBounds | null {
  const parts = getZonedParts(referenceDate, timeZone);

  if (granularity === "DAY") {
    const start = zonedWallTimeToUtc(parts.year, parts.month, parts.day, 0, 0, timeZone);
    const end = zonedWallTimeToUtc(parts.year, parts.month, parts.day, 23, 59, timeZone);
    return { start, end };
  }

  if (granularity === "WEEK") {
    // ISO week: Monday..Sunday. parts.weekday is 0=Sunday..6=Saturday.
    const daysSinceMonday = parts.weekday === 0 ? 6 : parts.weekday - 1;
    const mondayUtc = zonedWallTimeToUtc(parts.year, parts.month, parts.day, 0, 0, timeZone);
    const start = new Date(mondayUtc.getTime() - daysSinceMonday * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000 - 60_000);
    return { start, end };
  }

  if (granularity === "MONTH") {
    const start = zonedWallTimeToUtc(parts.year, parts.month, 1, 0, 0, timeZone);
    const nextMonth = parts.month === 12 ? { year: parts.year + 1, month: 1 } : { year: parts.year, month: parts.month + 1 };
    const end = new Date(zonedWallTimeToUtc(nextMonth.year, nextMonth.month, 1, 0, 0, timeZone).getTime() - 60_000);
    return { start, end };
  }

  if (granularity === "QUARTER") {
    const quarterStartMonth = Math.floor((parts.month - 1) / 3) * 3 + 1;
    const start = zonedWallTimeToUtc(parts.year, quarterStartMonth, 1, 0, 0, timeZone);
    const nextQuarterMonth = quarterStartMonth + 3;
    const next = nextQuarterMonth > 12 ? { year: parts.year + 1, month: nextQuarterMonth - 12 } : { year: parts.year, month: nextQuarterMonth };
    const end = new Date(zonedWallTimeToUtc(next.year, next.month, 1, 0, 0, timeZone).getTime() - 60_000);
    return { start, end };
  }

  if (granularity === "YEAR") {
    const start = zonedWallTimeToUtc(parts.year, 1, 1, 0, 0, timeZone);
    const end = new Date(zonedWallTimeToUtc(parts.year + 1, 1, 1, 0, 0, timeZone).getTime() - 60_000);
    return { start, end };
  }

  // CAMPAIGN / EXPERIMENT / PUBLICATION / CUSTOM_RANGE have no fixed calendar shape — the caller supplies explicit start/end instead of asking this function to derive one.
  return null;
}

export interface TimeSeriesPoint {
  key: string;
  date: Date;
  value: number;
  count: number;
}

/** Buckets a list of (date, value) pairs into local-day (or local-week/month) sums — the primitive every trend/chart/anomaly-detection function builds on. */
export function bucketByPeriod(points: { date: Date; value: number }[], granularity: "DAY" | "WEEK" | "MONTH", timeZone: string): TimeSeriesPoint[] {
  const buckets = new Map<string, { date: Date; sum: number; count: number }>();
  for (const point of points) {
    const bounds = getPeriodBounds(granularity, point.date, timeZone);
    const key = bounds ? zonedDayKey(bounds.start, timeZone) : zonedDayKey(point.date, timeZone);
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += point.value;
      existing.count += 1;
    } else {
      buckets.set(key, { date: bounds?.start ?? point.date, sum: point.value, count: 1 });
    }
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ key, date: v.date, value: v.sum, count: v.count }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
