import { mean, stddev, detectOutliersIQR } from "@/lib/performance/statistics";
import { PERFORMANCE_LIMITS } from "@/lib/performance/limits";
import type { PerformanceAnomalyMethod, PerformanceAnomalySeverity } from "@/lib/performance/types";

/**
 * Transparent, deterministic anomaly detection (spec section 39) — never
 * AI-based. The AI layer may only EXPLAIN an anomaly already detected here,
 * never decide whether one exists.
 */

export interface AnomalyDetectionResult {
  isAnomaly: boolean;
  method: PerformanceAnomalyMethod;
  severity: PerformanceAnomalySeverity;
  expectedValue: number | null;
  value: number;
}

function severityForZScore(absZ: number): PerformanceAnomalySeverity {
  if (absZ >= 5) return "CRITICAL";
  if (absZ >= 4) return "HIGH";
  if (absZ >= 3) return "MEDIUM";
  return "LOW";
}

function severityForPercentChange(absPercent: number): PerformanceAnomalySeverity {
  if (absPercent >= 300) return "CRITICAL";
  if (absPercent >= 150) return "HIGH";
  if (absPercent >= 75) return "MEDIUM";
  return "LOW";
}

/**
 * Tries, in order: standard-deviation z-score (|z| ≥ 3), then Tukey's IQR
 * fence, then an extreme percent-change fallback for short histories where
 * neither stddev nor IQR is reliable. Requires at least
 * PERFORMANCE_LIMITS.MIN_ANOMALY_HISTORY_POINTS prior points — a value
 * measured against a near-empty history is never flagged (spec section 39:
 * never blocking a legitimately new metric with only 1-2 points).
 */
export function detectValueAnomaly(historicalValues: number[], candidateValue: number): AnomalyDetectionResult | null {
  if (historicalValues.length < PERFORMANCE_LIMITS.MIN_ANOMALY_HISTORY_POINTS) return null;

  const historicalMean = mean(historicalValues);
  const sd = stddev(historicalValues);
  if (historicalMean !== null && sd !== null && sd > 0) {
    const z = (candidateValue - historicalMean) / sd;
    if (Math.abs(z) >= 3) {
      return { isAnomaly: true, method: "STDDEV", severity: severityForZScore(Math.abs(z)), expectedValue: historicalMean, value: candidateValue };
    }
  }

  const withCandidate = [...historicalValues, candidateValue];
  const iqrResult = detectOutliersIQR(withCandidate);
  if (iqrResult && iqrResult.outlierIndices.includes(withCandidate.length - 1)) {
    return { isAnomaly: true, method: "IQR", severity: "MEDIUM", expectedValue: historicalMean, value: candidateValue };
  }

  const lastValue = historicalValues[historicalValues.length - 1];
  if (lastValue !== 0) {
    const percentChange = ((candidateValue - lastValue) / Math.abs(lastValue)) * 100;
    if (Math.abs(percentChange) >= 75) {
      return { isAnomaly: true, method: "PERCENT_CHANGE", severity: severityForPercentChange(Math.abs(percentChange)), expectedValue: lastValue, value: candidateValue };
    }
  }

  return null;
}

/** Flags an unexpected absence of activity (e.g. zero content/publications/runs where a healthy baseline exists) or an unusual spike in volume. */
export function detectActivityAnomaly(expectedCount: number, actualCount: number): AnomalyDetectionResult | null {
  if (expectedCount < PERFORMANCE_LIMITS.MIN_ANOMALY_HISTORY_POINTS) return null;

  if (actualCount === 0 && expectedCount > 0) {
    return { isAnomaly: true, method: "MISSING_DATA", severity: "HIGH", expectedValue: expectedCount, value: 0 };
  }
  const ratio = expectedCount > 0 ? actualCount / expectedCount : 1;
  if (ratio <= 0.3) {
    return { isAnomaly: true, method: "ACTIVITY_DROP", severity: ratio <= 0.1 ? "HIGH" : "MEDIUM", expectedValue: expectedCount, value: actualCount };
  }
  if (ratio >= 3) {
    return { isAnomaly: true, method: "ACTIVITY_SPIKE", severity: ratio >= 5 ? "HIGH" : "MEDIUM", expectedValue: expectedCount, value: actualCount };
  }
  return null;
}
