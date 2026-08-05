/**
 * Deterministic "solidez de evidencia" classification (Fase 35 spec section
 * 11) — NEVER an AI-produced "confidence score". Computed purely from real,
 * already-known signals: data quality, coverage, recency, sample size, and
 * whether a benchmark/goal/experiment backs the numbers. Documented weights,
 * fully tested, reproducible for the exact same input.
 */

export const EVIDENCE_STRENGTH_LEVELS = ["STRONG", "MODERATE", "WEAK", "INSUFFICIENT"] as const;
export type EvidenceStrengthLevel = (typeof EVIDENCE_STRENGTH_LEVELS)[number];

export interface EvidenceStrengthInput {
  /** 0-100, from computeDataQuality(...).score */
  dataQualityScore: number;
  /** 0-100, from computeDataQuality(...).factors.coverage */
  coverage: number;
  /** 0-100, from computeDataQuality(...).factors.recency */
  recency: number;
  /** Total measurement count backing the metrics included in this context. */
  sampleSize: number;
  hasBenchmark: boolean;
  hasGoal: boolean;
  hasExperiment: boolean;
}

const MIN_SAMPLE_FOR_FULL_CREDIT = 30;

function clamp0to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Weighted base score (sums to 1): dataQuality 0.4, coverage 0.2, recency
 * 0.15, sample-size adequacy 0.15 (linear up to MIN_SAMPLE_FOR_FULL_CREDIT,
 * capped at 100 beyond it). Presence of a benchmark/goal/experiment each
 * adds a flat +5 bonus (never enough alone to overstate weak underlying
 * data) — capped at 100 before thresholding into a level.
 */
export function computeEvidenceStrengthScore(input: EvidenceStrengthInput): number {
  const sampleAdequacy = clamp0to100((Math.max(0, input.sampleSize) / MIN_SAMPLE_FOR_FULL_CREDIT) * 100);
  const base = input.dataQualityScore * 0.4 + input.coverage * 0.2 + input.recency * 0.15 + sampleAdequacy * 0.15;
  const bonus = (input.hasBenchmark ? 5 : 0) + (input.hasGoal ? 5 : 0) + (input.hasExperiment ? 10 : 0);
  return clamp0to100(base + bonus);
}

export function classifyEvidenceStrength(input: EvidenceStrengthInput): EvidenceStrengthLevel {
  if (input.sampleSize <= 0 || input.dataQualityScore <= 0) return "INSUFFICIENT";
  const score = computeEvidenceStrengthScore(input);
  if (score >= 75) return "STRONG";
  if (score >= 50) return "MODERATE";
  if (score >= 25) return "WEAK";
  return "INSUFFICIENT";
}
