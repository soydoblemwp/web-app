/**
 * Derived metric formulas (spec section 9) — every ratio applies a single,
 * declared formula; the denominator is always explicit and stored alongside
 * the result (see PerformanceMetricRecord.notes / evidence in the service
 * layer). Division by zero never produces Infinity/NaN — it returns null,
 * meaning "not computable right now", which the UI must show as an empty
 * state, never as 0%.
 */

export interface SafeRatioResult {
  value: number | null;
  numerator: number;
  denominator: number;
}

/** The one place a ratio is ever computed — never inline division elsewhere, so "handle division by zero" only has to be correct here. */
export function safeRatio(numerator: number, denominator: number, asPercentage = true): SafeRatioResult {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return { value: null, numerator, denominator };
  }
  const raw = numerator / denominator;
  if (!Number.isFinite(raw)) return { value: null, numerator, denominator };
  return { value: asPercentage ? raw * 100 : raw, numerator, denominator };
}

export function engagementRate(engagementTotal: number, reachOrImpressions: number): SafeRatioResult {
  return safeRatio(engagementTotal, reachOrImpressions);
}

export function clickThroughRate(clicks: number, impressions: number): SafeRatioResult {
  return safeRatio(clicks, impressions);
}

export function conversionRate(conversions: number, clicksOrSessions: number): SafeRatioResult {
  return safeRatio(conversions, clicksOrSessions);
}

export function completionRate(completedPlays: number, totalPlays: number): SafeRatioResult {
  return safeRatio(completedPlays, totalPlays);
}

export function contentCompletionRate(piecesCompleted: number, piecesPlanned: number): SafeRatioResult {
  return safeRatio(piecesCompleted, piecesPlanned);
}

export function approvalRate(approvals: number, decisionsTotal: number): SafeRatioResult {
  return safeRatio(approvals, decisionsTotal);
}

export function automationSuccessRate(successfulRuns: number, terminalRuns: number): SafeRatioResult {
  return safeRatio(successfulRuns, terminalRuns);
}
