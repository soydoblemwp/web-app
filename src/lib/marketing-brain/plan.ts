import { MARKETING_BRAIN_APPROVAL_GATE_KEYS, MARKETING_BRAIN_STEP_KEYS } from "@/lib/marketing-brain/types";
import type { MarketingBrainStepKeyValue, NormalizedBriefing, StagesConfig } from "@/lib/marketing-brain/types";

export interface StageDefinition {
  key: MarketingBrainStepKeyValue;
  order: number;
  label: string;
  description: string;
  /** Stages that must be COMPLETED (or SKIPPED, if disabled) before this one can run. */
  dependsOn: MarketingBrainStepKeyValue[];
  /** false: this stage always runs and can never be turned off (the pipeline's structural backbone). */
  toggleable: boolean;
  requiresAi: boolean;
}

/** The 12 pipeline stages, in execution order — the single source of truth for order/labels/dependencies/toggleability used by both the plan preview and the executor. */
export const STAGE_DEFINITIONS: StageDefinition[] = [
  { key: "INTERPRET_BRIEFING", order: 0, label: "Interpretar briefing", description: "Normaliza fechas, plataformas, frecuencia e idioma.", dependsOn: [], toggleable: false, requiresAi: false },
  { key: "PREPARE_CAMPAIGN", order: 1, label: "Preparar campaña", description: "Crea o reutiliza la campaña base.", dependsOn: ["INTERPRET_BRIEFING"], toggleable: false, requiresAi: false },
  { key: "GENERATE_STRATEGY", order: 2, label: "Generar estrategia", description: "Resumen, audiencia, propuesta de valor, objetivos, CTA.", dependsOn: ["PREPARE_CAMPAIGN"], toggleable: true, requiresAi: true },
  { key: "CREATE_PILLARS", order: 3, label: "Crear pilares", description: "Pilares de contenido con porcentaje, formatos y plataformas.", dependsOn: ["PREPARE_CAMPAIGN"], toggleable: true, requiresAi: true },
  { key: "CREATE_CONTENT_PLAN", order: 4, label: "Crear plan de contenidos", description: "Distribuye piezas propuestas en el rango de fechas.", dependsOn: ["CREATE_PILLARS"], toggleable: true, requiresAi: true },
  { key: "CREATE_PIECES", order: 5, label: "Crear piezas", description: "Guarda el plan aprobado como piezas reales de Campaign Studio.", dependsOn: ["CREATE_CONTENT_PLAN"], toggleable: false, requiresAi: false },
  { key: "GENERATE_DRAFTS", order: 6, label: "Generar borradores", description: "Crea un ContentItem con primer borrador por pieza.", dependsOn: ["CREATE_PIECES"], toggleable: true, requiresAi: true },
  { key: "ADAPT_PLATFORMS", order: 7, label: "Adaptar plataformas", description: "Adapta cada borrador a las demás plataformas seleccionadas.", dependsOn: ["GENERATE_DRAFTS"], toggleable: true, requiresAi: true },
  { key: "CREATE_PUBLICATIONS", order: 8, label: "Crear publicaciones", description: "Crea publicaciones en Publishing Hub para cada borrador/adaptación.", dependsOn: ["GENERATE_DRAFTS"], toggleable: true, requiresAi: false },
  { key: "PREPARE_APPROVAL", order: 9, label: "Preparar aprobación", description: "Asigna aprobador y deja las publicaciones en revisión si corresponde.", dependsOn: ["CREATE_PUBLICATIONS"], toggleable: false, requiresAi: false },
  { key: "PREPARE_CALENDAR", order: 10, label: "Preparar calendario", description: "Detecta conflictos de fecha/plataforma antes de programar.", dependsOn: ["PREPARE_APPROVAL"], toggleable: false, requiresAi: false },
  { key: "SCHEDULE", order: 11, label: "Programar", description: "Programa las publicaciones aprobadas, si la programación automática está activa.", dependsOn: ["PREPARE_CALENDAR"], toggleable: true, requiresAi: false },
];

export function getStageDefinition(key: MarketingBrainStepKeyValue): StageDefinition {
  const def = STAGE_DEFINITIONS.find((s) => s.key === key);
  if (!def) throw new Error(`Etapa desconocida: ${key}`);
  return def;
}

/** Default stage configuration for a fresh briefing — every stage enabled, no approval gates (the user opts into gates explicitly). */
export function defaultStagesConfig(): StagesConfig {
  const enabled = Object.fromEntries(MARKETING_BRAIN_STEP_KEYS.map((k) => [k, true])) as StagesConfig["enabled"];
  return { enabled, approvalGates: [] };
}

/** A stage can be toggled off only if it's marked toggleable AND no enabled later stage still depends on it. */
export function canDisableStage(key: MarketingBrainStepKeyValue, config: StagesConfig): boolean {
  const def = getStageDefinition(key);
  if (!def.toggleable) return false;
  const dependents = STAGE_DEFINITIONS.filter((s) => config.enabled[s.key] !== false && s.dependsOn.includes(key));
  return dependents.length === 0;
}

/** A stage is runnable only once every stage it depends on is enabled+completed (never SKIPPED as a substitute for a real completion when the dependency was itself required). Pure — callers supply which stages are already completed/skipped. */
export function areDependenciesSatisfied(
  key: MarketingBrainStepKeyValue,
  config: StagesConfig,
  resolvedKeys: Set<MarketingBrainStepKeyValue>
): boolean {
  const def = getStageDefinition(key);
  return def.dependsOn.every((dep) => config.enabled[dep] === false || resolvedKeys.has(dep));
}

export interface StageVolumeEstimate {
  key: MarketingBrainStepKeyValue;
  label: string;
  enabled: boolean;
  requiresApproval: boolean;
  /** A coarse operation count for this stage (AI calls + DB writes) — used only for cost/volume display, never a time estimate (spec section 22 explicitly forbids inventing durations). */
  operationCount: number;
  resourcesCreated: string[];
}

export interface ExecutionPlan {
  stages: StageVolumeEstimate[];
  totals: {
    pillars: number;
    pieces: number;
    contentItems: number;
    adaptations: number;
    socialPosts: number;
    aiGenerations: number;
  };
  warnings: string[];
  /** True when the estimated AI-generation volume exceeds the configurable cap — the caller must let the user reduce scope rather than silently truncating (spec section 22). */
  exceedsVolumeLimit: boolean;
}

/** Hard ceiling on AI generations per run — configurable-in-spirit (a constant here, matching this codebase's other hard-coded-but-documented limits like MAX_VIDEO_BYTES); crossing it blocks starting the run until the briefing is reduced in scope. */
export const MAX_AI_GENERATIONS_PER_RUN = 120;

/**
 * Pure — computes the visual execution plan (spec section 5) and the
 * confirmation summary (section 6) from the SAME data, since they're the
 * same underlying estimate rendered twice. Never touches the database:
 * pillar/piece/content-item counts here are deterministic ESTIMATES from the
 * normalized briefing, not a query against anything already created.
 */
export function buildExecutionPlan(briefing: NormalizedBriefing, config: StagesConfig): ExecutionPlan {
  const warnings: string[] = [...briefing.warnings];
  const platformCount = Math.max(1, briefing.platforms.length);
  const pillarCount = Math.min(6, Math.max(2, Math.ceil(briefing.maxPieces / 6)));
  const pieceCount = briefing.maxPieces;
  const contentItemCount = config.enabled.GENERATE_DRAFTS !== false ? pieceCount : 0;
  const adaptationCount =
    config.enabled.ADAPT_PLATFORMS !== false && briefing.autoAdaptPlatforms ? contentItemCount * Math.max(0, platformCount - 1) : 0;
  const socialPostCount = config.enabled.CREATE_PUBLICATIONS !== false ? contentItemCount + adaptationCount : 0;

  const aiGenerations =
    (config.enabled.GENERATE_STRATEGY !== false ? 1 : 0) +
    (config.enabled.CREATE_PILLARS !== false ? 1 : 0) +
    (config.enabled.CREATE_CONTENT_PLAN !== false ? 1 : 0) +
    (config.enabled.GENERATE_DRAFTS !== false ? contentItemCount : 0) +
    (config.enabled.ADAPT_PLATFORMS !== false ? adaptationCount : 0);

  if (pieceCount > 60) {
    warnings.push(`Se generarán ${pieceCount} piezas — un volumen alto. Revisa el alcance antes de confirmar.`);
  }
  if (briefing.platforms.some((p) => p !== "blog" && p !== "email" && p !== "newsletter") === false) {
    // no schedulable social platform selected — informational only
  }

  const stageResourceLabels: Partial<Record<MarketingBrainStepKeyValue, string[]>> = {
    PREPARE_CAMPAIGN: [briefing.campaignMode === "new" ? "1 campaña nueva" : "1 campaña reutilizada"],
    GENERATE_STRATEGY: ["1 estrategia (CampaignStrategy)"],
    CREATE_PILLARS: [`${pillarCount} pilares`],
    CREATE_CONTENT_PLAN: [`${pieceCount} piezas propuestas (plan, sin guardar aún)`],
    CREATE_PIECES: [`${pieceCount} piezas (CampaignContentPiece)`],
    GENERATE_DRAFTS: [`${contentItemCount} borradores (ContentItem)`],
    ADAPT_PLATFORMS: [`${adaptationCount} adaptaciones`],
    CREATE_PUBLICATIONS: [`${socialPostCount} publicaciones (SocialPost)`],
    SCHEDULE: briefing.schedulingMode === "automatic" ? ["Publicaciones aprobadas programadas"] : ["Sin programación automática"],
  };

  const stages: StageVolumeEstimate[] = STAGE_DEFINITIONS.map((def) => {
    const enabled = config.enabled[def.key] !== false;
    const operationCount =
      def.key === "GENERATE_DRAFTS"
        ? contentItemCount
        : def.key === "ADAPT_PLATFORMS"
          ? adaptationCount
          : def.key === "CREATE_PUBLICATIONS"
            ? socialPostCount
            : 1;
    return {
      key: def.key,
      label: def.label,
      enabled,
      requiresApproval: config.approvalGates.includes(def.key),
      operationCount: enabled ? operationCount : 0,
      resourcesCreated: enabled ? (stageResourceLabels[def.key] ?? []) : [],
    };
  });

  if (config.approvalGates.some((k) => !MARKETING_BRAIN_APPROVAL_GATE_KEYS.includes(k))) {
    warnings.push("Se configuró una aprobación en una etapa que no admite punto de control.");
  }
  if (briefing.requireApproval && !briefing.approverId) {
    warnings.push("Falta asignar un aprobador — las publicaciones no podrán programarse hasta configurarlo.");
  }

  return {
    stages,
    totals: {
      pillars: config.enabled.CREATE_PILLARS !== false ? pillarCount : 0,
      pieces: config.enabled.CREATE_PIECES !== false ? pieceCount : 0,
      contentItems: contentItemCount,
      adaptations: adaptationCount,
      socialPosts: socialPostCount,
      aiGenerations,
    },
    warnings,
    exceedsVolumeLimit: aiGenerations > MAX_AI_GENERATIONS_PER_RUN,
  };
}
