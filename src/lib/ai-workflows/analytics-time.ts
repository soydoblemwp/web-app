/**
 * Pure time-range/bucketing helpers for AI Workflows analytics — no DB, no
 * framework. The server always resolves a preset/custom period into
 * concrete `{from, to}` Date objects here (never trusts a client-computed
 * range), and buckets are generated for the WHOLE period up front so a
 * period with no data still produces empty buckets (a real, testable
 * "periodos sin datos" case) instead of silently vanishing.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export type AnalyticsGranularity = "hour" | "day" | "week";

export const ANALYTICS_PERIOD_PRESETS = ["24h", "7d", "30d", "90d"] as const;
export type AnalyticsPeriodPreset = (typeof ANALYTICS_PERIOD_PRESETS)[number];

const PRESET_MS: Record<AnalyticsPeriodPreset, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};

export type PeriodInput = { preset: AnalyticsPeriodPreset } | { from: Date; to: Date };

/** The single place a preset/custom period becomes concrete Date bounds — always server-side, `now` defaults to the real clock but is injectable for tests. */
export function resolvePeriod(input: PeriodInput, now: Date = new Date()): { from: Date; to: Date } {
  if ("preset" in input) {
    return { from: new Date(now.getTime() - PRESET_MS[input.preset]), to: now };
  }
  return { from: input.from, to: input.to };
}

/** Short periods bucket by hour, medium by day, long ranges by week — keeps a time series readable regardless of the selected range. */
export function pickGranularity(from: Date, to: Date): AnalyticsGranularity {
  const spanMs = Math.max(0, to.getTime() - from.getTime());
  if (spanMs <= 2 * DAY_MS) return "hour";
  if (spanMs <= 60 * DAY_MS) return "day";
  return "week";
}

function granularityStepMs(granularity: AnalyticsGranularity): number {
  return granularity === "hour" ? HOUR_MS : granularity === "day" ? DAY_MS : WEEK_MS;
}

/** Rounds `date` down to the start of its bucket (hour/day/week — week aligned to Monday, UTC, so it's deterministic and testable regardless of server timezone). */
export function bucketStart(date: Date, granularity: AnalyticsGranularity): Date {
  const d = new Date(date.getTime());
  if (granularity === "hour") {
    d.setUTCMinutes(0, 0, 0);
    return d;
  }
  d.setUTCHours(0, 0, 0, 0);
  if (granularity === "day") return d;
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

/** Every bucket boundary covering [from, to], inclusive of both ends — a period with no matching rows still gets its full set of (empty) buckets. */
export function generateBuckets(from: Date, to: Date, granularity: AnalyticsGranularity): Date[] {
  const buckets: Date[] = [];
  const stepMs = granularityStepMs(granularity);
  let cursor = bucketStart(from, granularity);
  const last = bucketStart(to, granularity);
  // Safety ceiling — even the longest supported custom range (366 days) at
  // hourly granularity would never approach this, but it keeps the loop
  // provably bounded regardless of input.
  let guard = 0;
  while (cursor.getTime() <= last.getTime() && guard < 100_000) {
    buckets.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + stepMs);
    guard += 1;
  }
  if (buckets.length === 0) buckets.push(bucketStart(from, granularity));
  return buckets;
}

/**
 * Groups arbitrary rows into the buckets covering [from, to] by a caller-
 * supplied date accessor, then reduces each bucket's rows into whatever
 * shape the caller needs (counts, averages, ...). A bucket's window is
 * [bucketStart, nextBucketStart) — inclusive start, exclusive end — so a
 * row is never double-counted across two adjacent buckets.
 */
export function bucketRows<T, R>(
  rows: T[],
  getDate: (row: T) => Date,
  from: Date,
  to: Date,
  granularity: AnalyticsGranularity,
  reduce: (bucketRows: T[]) => R
): Array<{ bucketStart: string; value: R }> {
  const buckets = generateBuckets(from, to, granularity);
  const stepMs = granularityStepMs(granularity);
  return buckets.map((start) => {
    const end = start.getTime() + stepMs;
    const bucketRowsList = rows.filter((row) => {
      const t = getDate(row).getTime();
      return t >= start.getTime() && t < end;
    });
    return { bucketStart: start.toISOString(), value: reduce(bucketRowsList) };
  });
}
