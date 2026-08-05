/**
 * Shared, framework-free types for the Performance-to-Strategy context
 * Marketing Brain can optionally select and freeze (Fase 35 spec sections
 * 6-8). Deliberately separates facts (observed) / derived (deterministic
 * calculation) / signals (deterministic trend/anomaly/rule) / hypotheses
 * (unproven interpretation) / constraints (data limitations) / missingData
 * (what would be needed but doesn't exist) — the AI must never receive a
 * hypothesis labeled as a fact.
 */

export const PERFORMANCE_CONTEXT_MODES = ["RECOMMENDED", "MANUAL", "NONE"] as const;
export type PerformanceContextModeValue = (typeof PERFORMANCE_CONTEXT_MODES)[number];

export const MB_CONTEXT_RESOURCE_TYPES = ["CONTENT_ITEM", "CAMPAIGN", "SOCIAL_POST", "PROJECT"] as const;
export type MbContextResourceType = (typeof MB_CONTEXT_RESOURCE_TYPES)[number];

/** Validated input the user (or the recommended-mode selector) produced — never the resolved data itself. */
export interface PerformanceContextSelectionInput {
  mode: PerformanceContextModeValue;
  periodStart?: string;
  periodEnd?: string;
  compareToPreviousPeriod?: boolean;
  resourceType?: MbContextResourceType;
  resourceIds?: string[];
  metricKeys?: string[];
  goalIds?: string[];
  benchmarkIds?: string[];
  experimentIds?: string[];
  recommendationIds?: string[];
  reportIds?: string[];
}

export interface ContextFactEntry {
  key: string;
  label: string;
  value: number;
  unit?: string;
  /** PerformanceMetricOrigin — always carried through so a fact is never presented as more certain than its real origin. */
  origin: string;
  sampleSize?: number;
  measuredAt?: string;
  resourceLabel?: string;
}

export interface ContextGoalFact {
  metricKey: string;
  type: string;
  status: string;
  targetValue: number | null;
}

export interface ContextBenchmarkFact {
  metricKey: string;
  source: string;
  value: number;
  label: string | null;
}

export interface ContextExperimentFact {
  name: string;
  type: string;
  status: string;
  conclusion: string | null;
  winnerLabel: string | null;
}

export interface ContextRecommendationFact {
  title: string;
  category: string;
  priority: string;
  status: string;
}

export interface ContextReportFact {
  title: string;
  type: string;
  periodStart: string;
  periodEnd: string;
}

export interface PerformanceContextFacts {
  metrics: ContextFactEntry[];
  goals: ContextGoalFact[];
  benchmarks: ContextBenchmarkFact[];
  experiments: ContextExperimentFact[];
  recommendations: ContextRecommendationFact[];
  reports: ContextReportFact[];
}

export interface ContextDerivedEntry {
  key: string;
  label: string;
  value: number | null;
  formula: string;
}

export interface ContextSignalEntry {
  type: "TREND" | "ANOMALY" | "RULE";
  key: string;
  label: string;
  severity?: string;
  description: string;
}

export interface ContextHypothesisEntry {
  key: string;
  label: string;
  /** Which fact/signal keys this interpretation is drawn from — so it's traceable, never a free-floating claim. */
  basedOn: string[];
}

/** The full deterministic bundle a session's context builder produces — this exact shape (minus counts) is what gets frozen into MarketingBrainContextSnapshot. */
export interface PerformanceContextBundle {
  facts: PerformanceContextFacts;
  derived: ContextDerivedEntry[];
  signals: ContextSignalEntry[];
  hypotheses: ContextHypothesisEntry[];
  constraints: string[];
  missingData: string[];
  dataQualityScore: number;
  dataQualityLevel: string;
  evidenceStrength: string;
  counts: {
    metricCount: number;
    resourceCount: number;
    recommendationCount: number;
    experimentCount: number;
    goalCount: number;
    benchmarkCount: number;
    reportCount: number;
  };
}
