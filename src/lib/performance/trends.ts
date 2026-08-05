import { mean, stddev } from "@/lib/performance/statistics";
import { PERFORMANCE_LIMITS } from "@/lib/performance/limits";
import type { PerformanceTrendDirection } from "@/lib/performance/types";

/**
 * Deterministic trend classification (spec section 38) — a single data
 * point is never classified as a trend; minimums are centrally defined
 * (PERFORMANCE_LIMITS.MIN_TREND_POINTS), never inline magic numbers.
 */

export interface TrendPoint {
  date: Date;
  value: number;
}

export interface TrendResult {
  direction: PerformanceTrendDirection;
  /** Simple linear-regression slope (value change per point) — null when insufficient data. */
  slopePerPoint: number | null;
  /** % change from the first-half average to the second-half average. */
  changePercent: number | null;
  /** Coefficient of variation (stddev/mean) — a simple, transparent volatility proxy. */
  volatility: number | null;
  sampleSize: number;
}

const RISING_FALLING_THRESHOLD_PERCENT = 10;
const VOLATILITY_THRESHOLD = 0.5;

interface LinearFit {
  slope: number;
  intercept: number;
}

function linearRegressionFit(values: number[]): LinearFit | null {
  const n = values.length;
  if (n < 2) return null;
  const xMean = (n - 1) / 2;
  const yMean = mean(values)!;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  if (denominator === 0) return null;
  const slope = numerator / denominator;
  return { slope, intercept: yMean - slope * xMean };
}

export function classifyTrend(points: TrendPoint[]): TrendResult {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const values = sorted.map((p) => p.value);

  if (values.length < PERFORMANCE_LIMITS.MIN_TREND_POINTS) {
    return { direction: "INSUFFICIENT_DATA", slopePerPoint: null, changePercent: null, volatility: null, sampleSize: values.length };
  }

  const overallMean = mean(values)!;
  const fit = linearRegressionFit(values);
  // Volatility is measured on the RESIDUALS left after removing the linear trend, never on raw dispersion around a flat mean — a smoothly rising/falling series has near-zero residuals and must never be misclassified as VOLATILE just because its values span a wide range.
  const residuals = fit ? values.map((v, i) => v - (fit.intercept + fit.slope * i)) : values.map((v) => v - overallMean);
  const residualSd = stddev(residuals);
  const meanAbs = mean(values.map((v) => Math.abs(v)));
  const volatility = meanAbs !== null && meanAbs !== 0 && residualSd !== null ? residualSd / meanAbs : null;

  const mid = Math.floor(values.length / 2);
  const firstHalfMean = mean(values.slice(0, mid || 1))!;
  const secondHalfMean = mean(values.slice(mid))!;
  const changePercent = firstHalfMean !== 0 ? ((secondHalfMean - firstHalfMean) / Math.abs(firstHalfMean)) * 100 : null;

  const slopePerPoint = fit?.slope ?? null;

  let direction: PerformanceTrendDirection;
  if (volatility !== null && volatility > VOLATILITY_THRESHOLD) {
    direction = "VOLATILE";
  } else if (changePercent === null) {
    direction = "STABLE";
  } else if (changePercent >= RISING_FALLING_THRESHOLD_PERCENT) {
    direction = "RISING";
  } else if (changePercent <= -RISING_FALLING_THRESHOLD_PERCENT) {
    direction = "FALLING";
  } else {
    direction = "STABLE";
  }

  return { direction, slopePerPoint, changePercent, volatility, sampleSize: values.length };
}
