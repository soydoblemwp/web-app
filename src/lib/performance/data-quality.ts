import type { PerformanceDataQualityLevel } from "@/lib/performance/types";

/**
 * Deterministic data-quality scoring (spec section 16) — never AI-based; the
 * same inputs always produce the same score, factor breakdown, and level.
 * Every factor is a plain 0-100 sub-score; the final score is a weighted
 * average, documented below.
 */

export interface DataQualityInput {
  /** How many period buckets (e.g. days) SHOULD have at least one measurement, given the requested range. */
  expectedPoints: number;
  /** How many period buckets actually have at least one measurement. */
  actualPoints: number;
  /** Days since the most recent measurement — 0 means "measured today". */
  daysSinceLastUpdate: number;
  duplicateCount: number;
  conflictCount: number;
  missingValueCount: number;
  totalValueCount: number;
  /** True when every record in scope uses the same granularity — mixing DAY and MONTH rows for the same comparison is a consistency problem. */
  granularityConsistent: boolean;
  /** The longest gap (in expected period buckets) with zero measurements — a proxy for "continuidad temporal". */
  longestGapRatio: number;
}

export interface DataQualityFactors {
  coverage: number;
  recency: number;
  consistency: number;
  completeness: number;
  duplication: number;
  continuity: number;
}

export interface DataQualityResult {
  score: number;
  level: PerformanceDataQualityLevel;
  factors: DataQualityFactors;
  warnings: string[];
}

function clamp0to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function levelForScore(score: number, hasAnyData: boolean): PerformanceDataQualityLevel {
  if (!hasAnyData) return "INSUFFICIENT";
  if (score >= 85) return "EXCELLENT";
  if (score >= 65) return "GOOD";
  if (score >= 40) return "LIMITED";
  if (score >= 20) return "POOR";
  return "INSUFFICIENT";
}

/**
 * Weights (sum to 1): coverage 0.25, recency 0.15, consistency 0.15,
 * completeness 0.20, duplication 0.15, continuity 0.10. Chosen so that
 * having enough real, recent, non-duplicated points dominates the score —
 * a single missing/conflicting value should never tank an otherwise solid
 * dataset, but sparse or stale coverage always will.
 */
export function computeDataQuality(input: DataQualityInput): DataQualityResult {
  const warnings: string[] = [];
  const hasAnyData = input.actualPoints > 0 && input.totalValueCount > 0;

  const coverage = input.expectedPoints > 0 ? clamp0to100((input.actualPoints / input.expectedPoints) * 100) : hasAnyData ? 100 : 0;
  if (coverage < 50) warnings.push("Cobertura de datos baja: faltan mediciones para buena parte del periodo.");

  const recency = clamp0to100(100 - input.daysSinceLastUpdate * 8);
  if (input.daysSinceLastUpdate > 7) warnings.push(`Las métricas más recientes tienen ${input.daysSinceLastUpdate} día(s) de antigüedad.`);

  const consistency = input.granularityConsistent ? 100 : 40;
  if (!input.granularityConsistent) warnings.push("Se están mezclando periodos de distinta granularidad en la misma comparación.");

  const completeness = input.totalValueCount > 0 ? clamp0to100(100 - (input.missingValueCount / input.totalValueCount) * 100) : 0;
  if (input.totalValueCount > 0 && input.missingValueCount / input.totalValueCount > 0.2) warnings.push("Hay una proporción notable de valores ausentes.");

  const duplication = input.totalValueCount > 0 ? clamp0to100(100 - ((input.duplicateCount + input.conflictCount) / input.totalValueCount) * 100) : 100;
  if (input.duplicateCount > 0) warnings.push(`Se detectaron ${input.duplicateCount} mediciones duplicadas.`);
  if (input.conflictCount > 0) warnings.push(`Se detectaron ${input.conflictCount} mediciones superpuestas en conflicto.`);

  const continuity = clamp0to100(100 - input.longestGapRatio * 100);
  if (input.longestGapRatio > 0.3) warnings.push("Existe un vacío prolongado sin mediciones dentro del periodo.");

  const score = hasAnyData ? clamp0to100(coverage * 0.25 + recency * 0.15 + consistency * 0.15 + completeness * 0.2 + duplication * 0.15 + continuity * 0.1) : 0;

  return {
    score: Math.round(score),
    level: levelForScore(score, hasAnyData),
    factors: { coverage: Math.round(coverage), recency: Math.round(recency), consistency: Math.round(consistency), completeness: Math.round(completeness), duplication: Math.round(duplication), continuity: Math.round(continuity) },
    warnings,
  };
}
