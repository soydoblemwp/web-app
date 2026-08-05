import { PERFORMANCE_LIMITS } from "@/lib/performance/limits";
import type { PerformanceRecommendationCategory, PerformanceRecommendationPriority, PerformanceRecommendationActionType, PerformanceResourceType } from "@/lib/performance/types";

/**
 * The central, typed deterministic rules registry (spec section 26) — every
 * rule this phase actually evaluates lives here, never scattered across
 * components. Rules only ever read facts the caller already computed from
 * real data (src/server/services/performance-recommendations.ts) — a rule
 * never fabricates a fact, and never runs when the fact it needs is
 * undefined (spec's "no inventes métricas" applies to rule inputs too).
 */

export type RuleFactValue = number | boolean | string | null | undefined;
export type RuleFacts = Record<string, RuleFactValue>;

export interface RuleDefinitionSpec {
  key: string;
  category: PerformanceRecommendationCategory;
  severity: PerformanceRecommendationPriority;
  compatibleResourceTypes: PerformanceResourceType[];
  compatibleActions: PerformanceRecommendationActionType[];
  description: string;
  /** Pure evaluation — returns a formatted, SPECIFIC message (spec section 28: never a generic "mejora tu contenido") when the condition holds for the given facts, else null. */
  evaluate: (facts: RuleFacts) => string | null;
}

function num(v: RuleFactValue): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export const PERFORMANCE_RULES: RuleDefinitionSpec[] = [
  {
    key: "content_many_revisions",
    category: "CONTENT",
    severity: "MEDIUM",
    compatibleResourceTypes: ["CONTENT_ITEM"],
    compatibleActions: ["CONTENT_VERSION", "AGENT_RUN"],
    description: "Contenido con un número inusualmente alto de revisiones.",
    evaluate: (facts) => {
      const versions = num(facts.versionsCount);
      if (versions === null || versions < 6) return null;
      return `Esta pieza acumula ${versions} revisiones, muy por encima de lo habitual. Considera revisar el brief o el Brand Profile usado antes de seguir iterando.`;
    },
  },
  {
    key: "content_stalled",
    category: "CONTENT",
    severity: "MEDIUM",
    compatibleResourceTypes: ["CONTENT_ITEM"],
    compatibleActions: ["INTERNAL_TASK", "WORKFLOW_AUTOMATION"],
    description: "Contenido detenido sin actividad durante demasiado tiempo.",
    evaluate: (facts) => {
      const days = num(facts.daysSinceLastUpdate);
      if (days === null || days < 14) return null;
      return `Este contenido lleva ${days} días sin actividad. Considera reasignarlo o activar un recordatorio automático.`;
    },
  },
  {
    key: "campaign_delayed",
    category: "CAMPAIGN",
    severity: "HIGH",
    compatibleResourceTypes: ["CAMPAIGN"],
    compatibleActions: ["CAMPAIGN_CONTENT_PIECE", "WORKFLOW_AUTOMATION"],
    description: "Campaña con piezas retrasadas respecto a su fecha planeada.",
    evaluate: (facts) => {
      const delayed = num(facts.delayedPiecesCount);
      if (delayed === null || delayed <= 0) return null;
      return `${delayed} pieza(s) de esta campaña tienen fecha planeada ya vencida sin completarse. Revisa la asignación de responsables.`;
    },
  },
  {
    key: "social_repeated_rejections",
    category: "SOCIAL",
    severity: "HIGH",
    compatibleResourceTypes: ["SOCIAL_POST", "CAMPAIGN"],
    compatibleActions: ["SOCIAL_POST", "AGENT_RUN"],
    description: "Publicaciones rechazadas repetidamente.",
    evaluate: (facts) => {
      const rejections = num(facts.rejectionCount);
      if (rejections === null || rejections < 3) return null;
      return `Se registraron ${rejections} rechazos recientes en publicaciones. Considera revisar el tono o el checklist previo a enviar a aprobación.`;
    },
  },
  {
    key: "content_low_seo",
    category: "CONTENT",
    severity: "MEDIUM",
    compatibleResourceTypes: ["CONTENT_ITEM"],
    compatibleActions: ["AGENT_RUN", "CONTENT_VERSION"],
    description: "Puntuación SEO baja.",
    evaluate: (facts) => {
      const score = num(facts.seoScore);
      if (score === null || score >= 50) return null;
      return `La puntuación SEO de este contenido es ${score}/100. El SEO Agent puede proponer mejoras concretas de título, meta descripción y densidad de palabra clave.`;
    },
  },
  {
    key: "content_unsupported_claims",
    category: "CONTENT",
    severity: "HIGH",
    compatibleResourceTypes: ["CONTENT_ITEM"],
    compatibleActions: ["KNOWLEDGE_QUERY", "CONTENT_VERSION"],
    description: "Afirmaciones sin respaldo de Knowledge Base.",
    evaluate: (facts) => {
      const unsupported = num(facts.unsupportedClaimsCount);
      if (unsupported === null || unsupported <= 0) return null;
      return `Se detectaron ${unsupported} afirmación(es) sin cita de respaldo en Knowledge Base. Considera verificarlas antes de publicar.`;
    },
  },
  {
    key: "knowledge_insufficient_coverage",
    category: "KNOWLEDGE",
    severity: "MEDIUM",
    compatibleResourceTypes: ["PROJECT"],
    compatibleActions: ["KNOWLEDGE_QUERY"],
    description: "Cobertura insuficiente de fuentes de Knowledge Base.",
    evaluate: (facts) => {
      const coverage = num(facts.knowledgeSourceCoveragePercent);
      if (coverage === null || coverage >= 40) return null;
      return `Solo el ${coverage}% de las fuentes de Knowledge Base están listas para usarse. Revisa las fuentes con error o pendientes de OCR.`;
    },
  },
  {
    key: "automation_repeated_failures",
    category: "AUTOMATION",
    severity: "HIGH",
    compatibleResourceTypes: ["PROJECT"],
    compatibleActions: ["WORKFLOW_AUTOMATION"],
    description: "Automatización con una tasa de fallos elevada.",
    evaluate: (facts) => {
      const rate = num(facts.automationFailureRatePercent);
      if (rate === null || rate < 30) return null;
      return `El ${rate}% de las ejecuciones de automatización recientes terminaron en error. Revisa la configuración del disparador o del workflow asociado.`;
    },
  },
  {
    key: "agent_repeated_failures",
    category: "AUTOMATION",
    severity: "MEDIUM",
    compatibleResourceTypes: ["PROJECT"],
    compatibleActions: ["AGENT_RUN"],
    description: "AgentRun con fallos repetidos.",
    evaluate: (facts) => {
      const failures = num(facts.agentRunFailureCount);
      if (failures === null || failures < 3) return null;
      return `Se registraron ${failures} ejecuciones de agente fallidas recientemente. Revisa el agente o el contexto que está recibiendo.`;
    },
  },
  {
    key: "data_quality_too_low",
    category: "DATA_QUALITY",
    severity: "MEDIUM",
    compatibleResourceTypes: ["PROJECT", "CAMPAIGN", "CONTENT_ITEM"],
    compatibleActions: ["INTERNAL_TASK"],
    description: "Calidad de datos insuficiente para conclusiones fiables.",
    evaluate: (facts) => {
      const score = num(facts.dataQualityScore);
      if (score === null || score >= 40) return null;
      return `La calidad de los datos disponibles (${score}/100) es baja. Registra o importa más mediciones antes de sacar conclusiones.`;
    },
  },
  {
    key: "metric_falling",
    category: "CAMPAIGN",
    severity: "HIGH",
    compatibleResourceTypes: ["CAMPAIGN", "CONTENT_ITEM", "SOCIAL_POST"],
    compatibleActions: ["EXPERIMENT", "AGENT_RUN"],
    description: "Una métrica clave está cayendo.",
    evaluate: (facts) => {
      if (facts.trendDirection !== "FALLING") return null;
      const metricName = typeof facts.metricLabel === "string" ? facts.metricLabel : "esta métrica";
      const changePercent = num(facts.changePercent);
      return changePercent !== null
        ? `${metricName} bajó un ${Math.abs(changePercent).toFixed(1)}% en el periodo analizado. Considera crear un experimento para revertir la tendencia.`
        : `${metricName} muestra una tendencia a la baja en el periodo analizado.`;
    },
  },
  {
    key: "metric_rising",
    category: "CAMPAIGN",
    severity: "LOW",
    compatibleResourceTypes: ["CAMPAIGN", "CONTENT_ITEM", "SOCIAL_POST"],
    compatibleActions: ["SOCIAL_POST", "CAMPAIGN_CONTENT_PIECE"],
    description: "Una métrica clave está creciendo — oportunidad de capitalizar.",
    evaluate: (facts) => {
      if (facts.trendDirection !== "RISING") return null;
      const metricName = typeof facts.metricLabel === "string" ? facts.metricLabel : "esta métrica";
      const changePercent = num(facts.changePercent);
      return changePercent !== null
        ? `${metricName} subió un ${changePercent.toFixed(1)}% en el periodo analizado. Considera adaptar este formato a otras plataformas mientras la tendencia se mantiene.`
        : `${metricName} muestra una tendencia al alza en el periodo analizado.`;
    },
  },
  {
    key: "content_missing_cta",
    category: "CONTENT",
    severity: "LOW",
    compatibleResourceTypes: ["CONTENT_ITEM"],
    compatibleActions: ["CONTENT_VERSION"],
    description: "Contenido sin llamada a la acción.",
    evaluate: (facts) => (facts.hasCta === false ? "Este contenido no tiene una llamada a la acción (CTA) definida." : null),
  },
  {
    key: "content_missing_brand_profile",
    category: "CONTENT",
    severity: "LOW",
    compatibleResourceTypes: ["CONTENT_ITEM"],
    compatibleActions: ["CONTENT_VERSION"],
    description: "Contenido sin Brand Profile asignado.",
    evaluate: (facts) => (facts.hasBrandProfile === false ? "Este contenido no usa ningún Brand Profile — el tono y las reglas de marca podrían no aplicarse." : null),
  },
  {
    key: "social_posts_without_date",
    category: "SOCIAL",
    severity: "LOW",
    compatibleResourceTypes: ["CAMPAIGN", "PROJECT"],
    compatibleActions: ["SOCIAL_POST"],
    description: "Publicaciones sin fecha programada.",
    evaluate: (facts) => {
      const count = num(facts.postsWithoutDateCount);
      if (count === null || count <= 0) return null;
      return `${count} publicación(es) no tienen fecha programada.`;
    },
  },
  {
    key: "campaign_incomplete_pieces",
    category: "CAMPAIGN",
    severity: "MEDIUM",
    compatibleResourceTypes: ["CAMPAIGN"],
    compatibleActions: ["CAMPAIGN_CONTENT_PIECE"],
    description: "Piezas de campaña incompletas (sin plataforma, formato u objetivo).",
    evaluate: (facts) => {
      const count = num(facts.incompletePiecesCount);
      if (count === null || count <= 0) return null;
      return `${count} pieza(s) de esta campaña están incompletas (falta plataforma, formato u objetivo).`;
    },
  },
  {
    key: "experiment_insufficient_sample",
    category: "EXPERIMENT",
    severity: "LOW",
    compatibleResourceTypes: ["EXPERIMENT_VARIANT"],
    compatibleActions: ["EXPERIMENT"],
    description: "Experimento sin muestra suficiente para concluir.",
    evaluate: (facts) => {
      const sampleSize = num(facts.sampleSize);
      if (sampleSize === null || sampleSize >= PERFORMANCE_LIMITS.MIN_EXPERIMENT_SAMPLE_SIZE) return null;
      return `Este experimento solo tiene ${sampleSize} muestra(s) por variante — se recomienda un mínimo de ${PERFORMANCE_LIMITS.MIN_EXPERIMENT_SAMPLE_SIZE} antes de declarar un ganador.`;
    },
  },
];

export function findRule(key: string): RuleDefinitionSpec | undefined {
  return PERFORMANCE_RULES.find((r) => r.key === key);
}

export function listRules(): RuleDefinitionSpec[] {
  return PERFORMANCE_RULES;
}

export interface RuleMatch {
  ruleKey: string;
  category: PerformanceRecommendationCategory;
  severity: PerformanceRecommendationPriority;
  message: string;
  compatibleActions: PerformanceRecommendationActionType[];
}

/** Evaluates every rule compatible with the given resource type against the supplied facts — returns only the rules whose condition actually matched. */
export function evaluateRules(resourceType: PerformanceResourceType, facts: RuleFacts): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const rule of PERFORMANCE_RULES) {
    if (!rule.compatibleResourceTypes.includes(resourceType)) continue;
    const message = rule.evaluate(facts);
    if (message) matches.push({ ruleKey: rule.key, category: rule.category, severity: rule.severity, message, compatibleActions: rule.compatibleActions });
  }
  return matches;
}
