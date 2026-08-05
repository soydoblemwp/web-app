/**
 * Pure, dependency-free statistical utilities (spec section 23) — no large
 * stats library was added; every function here is small enough to
 * hand-verify and is covered by tests. Each function documents its formula
 * and assumptions in a comment. The AI layer never computes these numbers
 * itself from free text — it only ever narrates numbers this module already
 * produced (spec section 27: "la IA no debe calcular estadísticas críticas
 * mediante texto libre").
 */

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Sample standard deviation (Bessel-corrected, n-1 denominator) — the standard choice when values are a sample, not the full population. Returns null for fewer than 2 points (stddev is undefined for a single point). */
export function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Linear interpolation percentile (the common "R type 7" method) — p is 0-100. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export interface OutlierResult {
  lowerBound: number;
  upperBound: number;
  outlierIndices: number[];
}

/** Tukey's IQR fence (1.5×IQR) — the standard, parameter-free outlier rule; needs at least 4 points to have a meaningful Q1/Q3 split. */
export function detectOutliersIQR(values: number[]): OutlierResult | null {
  if (values.length < 4) return null;
  const q1 = percentile(values, 25)!;
  const q3 = percentile(values, 75)!;
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const outlierIndices = values.reduce<number[]>((acc, v, i) => {
    if (v < lowerBound || v > upperBound) acc.push(i);
    return acc;
  }, []);
  return { lowerBound, upperBound, outlierIndices };
}

/** Abramowitz & Stegun 7.1.26 approximation of the standard normal CDF — accurate to ~1.5e-7, standard textbook approximation, avoids adding a stats dependency for a single function. */
export function standardNormalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export interface ProportionInterval {
  proportion: number;
  marginOfError: number;
  lowerBound: number;
  upperBound: number;
}

/** Wald confidence interval for a proportion — the simplest closed-form interval; less accurate than Wilson's for very small n or extreme proportions (documented limitation, spec section 23), but transparent and easy to verify by hand. z=1.96 ≈ 95% confidence. */
export function confidenceIntervalForProportion(successes: number, total: number, z = 1.96): ProportionInterval | null {
  if (total <= 0) return null;
  const p = successes / total;
  const marginOfError = z * Math.sqrt((p * (1 - p)) / total);
  return { proportion: p, marginOfError, lowerBound: Math.max(0, p - marginOfError), upperBound: Math.min(1, p + marginOfError) };
}

export interface TwoProportionTestResult {
  proportionA: number;
  proportionB: number;
  absoluteDifference: number;
  relativeDifference: number | null;
  zScore: number;
  pValue: number;
  significantAt95: boolean;
}

/** Two-proportion z-test (pooled variance) — the standard test for "did conversion rate A differ from B", valid when both samples are reasonably large (np ≥ 5 rule of thumb) — the caller is responsible for checking sample size before trusting significance (spec section 22/23). */
export function twoProportionZTest(successesA: number, totalA: number, successesB: number, totalB: number): TwoProportionTestResult | null {
  if (totalA <= 0 || totalB <= 0) return null;
  const pA = successesA / totalA;
  const pB = successesB / totalB;
  const pooled = (successesA + successesB) / (totalA + totalB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
  if (se === 0) return null;
  const zScore = (pB - pA) / se;
  const pValue = 2 * (1 - standardNormalCdf(Math.abs(zScore)));
  return {
    proportionA: pA,
    proportionB: pB,
    absoluteDifference: pB - pA,
    relativeDifference: pA !== 0 ? (pB - pA) / pA : null,
    zScore,
    pValue,
    significantAt95: pValue < 0.05,
  };
}

export interface TwoMeanTestResult {
  meanA: number;
  meanB: number;
  absoluteDifference: number;
  relativeDifference: number | null;
  tStat: number;
  pValueApprox: number;
  significantAt95: boolean;
}

/** Welch's t-test statistic (unequal variances assumed) with a NORMAL-distribution approximation for the p-value instead of the exact t-distribution (spec section 23 requires documenting assumptions/limitations: this p-value is only a close approximation, most accurate when both samples have at least ~30 points — for smaller samples it can be somewhat optimistic/conservative versus the exact Student's t reference). Returns null when either sample has fewer than 2 points (stddev undefined) or variance is zero in both. */
export function twoSampleTTestApprox(valuesA: number[], valuesB: number[]): TwoMeanTestResult | null {
  const meanA = mean(valuesA);
  const meanB = mean(valuesB);
  const sdA = stddev(valuesA);
  const sdB = stddev(valuesB);
  if (meanA === null || meanB === null || sdA === null || sdB === null) return null;
  const se = Math.sqrt((sdA * sdA) / valuesA.length + (sdB * sdB) / valuesB.length);
  if (se === 0) return null;
  const tStat = (meanB - meanA) / se;
  const pValueApprox = 2 * (1 - standardNormalCdf(Math.abs(tStat)));
  return {
    meanA,
    meanB,
    absoluteDifference: meanB - meanA,
    relativeDifference: meanA !== 0 ? (meanB - meanA) / meanA : null,
    tStat,
    pValueApprox,
    significantAt95: pValueApprox < 0.05,
  };
}

/**
 * Rough recommended minimum sample size PER VARIANT for a two-proportion
 * comparison, using the standard normal-approximation formula for a fixed
 * baseline rate, minimum detectable absolute effect, and 95%/80%
 * significance/power. This is an ESTIMATE to guide experiment planning, not
 * a guarantee — real power depends on the true underlying effect (spec
 * section 23: documented assumption).
 */
export function recommendedMinimumSampleSize(baselineRate: number, minDetectableEffect: number, alpha = 0.05, power = 0.8): number | null {
  if (baselineRate <= 0 || baselineRate >= 1 || minDetectableEffect <= 0) return null;
  const zAlpha = 1.959963985; // two-sided, alpha=0.05
  const zBeta = 0.841621234; // power=0.8
  void alpha;
  void power;
  const p1 = baselineRate;
  const p2 = Math.min(0.999, baselineRate + minDetectableEffect);
  const pooled = (p1 + p2) / 2;
  const numerator = (zAlpha * Math.sqrt(2 * pooled * (1 - pooled)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  const denominator = (p2 - p1) ** 2;
  return Math.ceil(numerator / denominator);
}
