import type { AiToolDefinition } from "@/lib/ai-center/tools/types";
import {
  buildSocialCalendarSystemPrompt,
  buildSocialCalendarPrompt,
  buildMonthlyPlannerSystemPrompt,
  buildMonthlyPlannerPrompt,
  buildMultiPlatformPostSystemPrompt,
  buildMultiPlatformPostPrompt,
  buildRepurposeContentSystemPrompt,
  buildRepurposeContentPrompt,
  buildViralContentIdeasSystemPrompt,
  buildViralContentIdeasPrompt,
  buildAudienceAnalyzerSystemPrompt,
  buildAudienceAnalyzerPrompt,
  buildGrowthStrategySystemPrompt,
  buildGrowthStrategyPrompt,
  buildEngagementBoosterSystemPrompt,
  buildEngagementBoosterPrompt,
  buildScheduleOptimizerSystemPrompt,
  buildScheduleOptimizerPrompt,
  buildSocialAuditSystemPrompt,
  buildSocialAuditPrompt,
} from "@/lib/ai-center/tools/social-media-prompts";

const PLATFORMS_PLACEHOLDER = "Instagram, TikTok, LinkedIn";

/**
 * Every fully-implemented Social Media AI tool, as a declarative definition
 * the generic AiGenerationForm engine can render — same pattern as
 * youtube.ts and instagram.ts. Every tool works across any platform the
 * user names in the free-text "plataformas" field; there is no per-platform
 * branch anywhere in this file or in AiGenerationForm — the model adapts
 * based on that text. Registering these in
 * src/lib/ai-center/tools/registry.ts is the only wiring Chat IA's intent
 * router needs to start using them automatically.
 */
export const SOCIAL_MEDIA_TOOLS: AiToolDefinition[] = [
  {
    slug: "social-calendar",
    routeSegment: "calendar",
    label: "Content Calendar",
    description: "Genera un calendario de contenido distribuido por días para varias plataformas.",
    fields: [
      { name: "nicho", label: "Nicho de la cuenta", type: "textarea", required: true, maxLength: 500 },
      { name: "plataformas", label: "Plataformas", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "dias", label: "Días a planificar", type: "number", defaultValue: 7, min: 1, max: 30, required: true },
      { name: "frecuencia", label: "Publicaciones por semana", type: "number", defaultValue: 3, min: 1, max: 21, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildSocialCalendarSystemPrompt,
    buildUserPrompt: (v) =>
      buildSocialCalendarPrompt({ nicho: v.nicho, plataformas: v.plataformas, dias: v.dias, frecuencia: v.frecuencia, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: (v) => `Calendario de contenido: ${v.nicho}`,
    contentType: "OTHER",
    resultKind: "CAMPAIGN_PLAN",
  },
  {
    slug: "social-monthly-planner",
    routeSegment: "monthly-planner",
    label: "Monthly Content Planner",
    description: "Genera un plan de contenido organizado por semanas para todo un mes.",
    fields: [
      { name: "nicho", label: "Nicho de la cuenta", type: "textarea", required: true, maxLength: 500 },
      { name: "plataformas", label: "Plataformas", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "objetivos", label: "Objetivos del mes", type: "textarea", required: true, maxLength: 500 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildMonthlyPlannerSystemPrompt,
    buildUserPrompt: (v) =>
      buildMonthlyPlannerPrompt({ nicho: v.nicho, plataformas: v.plataformas, objetivos: v.objetivos, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Plan mensual: ${v.nicho}`,
    contentType: "OTHER",
    resultKind: "CAMPAIGN_PLAN",
  },
  {
    slug: "social-multi-platform-post",
    routeSegment: "multi-platform-post",
    label: "Multi Platform Post Generator",
    description: "Genera una versión nativa de una publicación para cada plataforma indicada.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "plataformas", label: "Plataformas", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Cercano y profesional", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildMultiPlatformPostSystemPrompt,
    buildUserPrompt: (v) => buildMultiPlatformPostPrompt({ tema: v.tema, plataformas: v.plataformas, tono: v.tono, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: (v) => `Publicación multiplataforma: ${v.tema}`,
    contentType: "SOCIAL_TEXT",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "social-repurpose",
    routeSegment: "repurpose",
    label: "Repurpose Content",
    description: "Reaprovecha una pieza de contenido existente en versiones nativas para otras plataformas.",
    fields: [
      { name: "contenidoOriginal", label: "Contenido original", type: "textarea", required: true, maxLength: 8000 },
      { name: "plataformas", label: "Plataformas de destino", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildRepurposeContentSystemPrompt,
    buildUserPrompt: (v) =>
      buildRepurposeContentPrompt({ contenidoOriginal: v.contenidoOriginal, plataformas: v.plataformas, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: () => "Contenido reaprovechado",
    contentType: "OTHER",
    resultKind: "ADAPTATION",
  },
  {
    slug: "social-viral-ideas",
    routeSegment: "viral-ideas",
    label: "Viral Content Ideas",
    description: "Genera ideas de contenido con potencial de interacción y de compartirse, organizadas por categoría.",
    fields: [
      { name: "nicho", label: "Nicho de la cuenta", type: "textarea", required: true, maxLength: 500 },
      { name: "plataformas", label: "Plataformas", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de ideas", type: "number", defaultValue: 8, min: 1, max: 20, required: true },
    ],
    buildSystemPrompt: buildViralContentIdeasSystemPrompt,
    buildUserPrompt: (v) =>
      buildViralContentIdeasPrompt({ nicho: v.nicho, plataformas: v.plataformas, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "text",
    buildItemTitle: (v) => `Ideas virales: ${v.nicho}`,
    contentType: "SOCIAL_TEXT",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "social-audience-analyzer",
    routeSegment: "audience-analyzer",
    label: "Audience Analyzer",
    description: "Analiza tu audiencia y sugiere perfiles, intereses y puntos de dolor a partir de lo que describas.",
    fields: [
      { name: "nicho", label: "Nicho de la cuenta", type: "text", required: true, maxLength: 200 },
      { name: "descripcionAudiencia", label: "Qué sabes de tu audiencia", type: "textarea", required: true, maxLength: 1500 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildAudienceAnalyzerSystemPrompt,
    buildUserPrompt: (v) =>
      buildAudienceAnalyzerPrompt({ nicho: v.nicho, descripcionAudiencia: v.descripcionAudiencia, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Análisis de audiencia: ${v.nicho}`,
    contentType: "OTHER",
    resultKind: "ANALYSIS",
  },
  {
    slug: "social-growth-strategy",
    routeSegment: "growth-strategy",
    label: "Growth Strategy Generator",
    description: "Genera una estrategia de crecimiento accionable para tus redes sociales.",
    fields: [
      { name: "nicho", label: "Nicho de la cuenta", type: "textarea", required: true, maxLength: 500 },
      { name: "objetivo", label: "Objetivo principal", type: "text", required: true, maxLength: 300 },
      { name: "plataformas", label: "Plataformas", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildGrowthStrategySystemPrompt,
    buildUserPrompt: (v) =>
      buildGrowthStrategyPrompt({ nicho: v.nicho, objetivo: v.objetivo, plataformas: v.plataformas, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Estrategia de crecimiento: ${v.nicho}`,
    contentType: "OTHER",
    resultKind: "CAMPAIGN_PLAN",
  },
  {
    slug: "social-engagement-booster",
    routeSegment: "engagement-booster",
    label: "Engagement Booster",
    description: "Sugiere mejoras concretas para aumentar la interacción de una publicación.",
    fields: [
      { name: "contenido", label: "Publicación o tema", type: "textarea", required: true, maxLength: 3000 },
      { name: "plataformas", label: "Plataformas", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildEngagementBoosterSystemPrompt,
    buildUserPrompt: (v) => buildEngagementBoosterPrompt({ contenido: v.contenido, plataformas: v.plataformas, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: () => "Sugerencias de interacción",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "social-schedule-optimizer",
    routeSegment: "schedule-optimizer",
    label: "Content Schedule Optimizer",
    description: "Sugiere los mejores días y horarios orientativos para publicar en cada plataforma.",
    fields: [
      { name: "plataformas", label: "Plataformas", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "frecuencia", label: "Publicaciones por semana", type: "number", defaultValue: 3, min: 1, max: 21, required: true },
      { name: "audiencia", label: "Audiencia objetivo", type: "text", maxLength: 300 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildScheduleOptimizerSystemPrompt,
    buildUserPrompt: (v) =>
      buildScheduleOptimizerPrompt({ plataformas: v.plataformas, frecuencia: v.frecuencia, audiencia: v.audiencia, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: (v) => `Horario óptimo: ${v.plataformas}`,
    contentType: "OTHER",
    resultKind: "CAMPAIGN_PLAN",
  },
  {
    slug: "social-audit",
    routeSegment: "audit",
    label: "Social Media Audit",
    description: "Genera una auditoría honesta de tu presencia en redes sociales con recomendaciones.",
    fields: [
      { name: "nicho", label: "Nicho de la cuenta", type: "text", required: true, maxLength: 200 },
      { name: "plataformas", label: "Plataformas activas", type: "text", defaultValue: PLATFORMS_PLACEHOLDER, maxLength: 200, required: true },
      { name: "retosActuales", label: "Retos actuales", type: "textarea", maxLength: 1500 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildSocialAuditSystemPrompt,
    buildUserPrompt: (v) =>
      buildSocialAuditPrompt({ nicho: v.nicho, plataformas: v.plataformas, retosActuales: v.retosActuales, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Auditoría de redes: ${v.nicho}`,
    contentType: "OTHER",
    resultKind: "ANALYSIS",
  },
];

export function getSocialMediaTool(routeSegment: string): AiToolDefinition | undefined {
  return SOCIAL_MEDIA_TOOLS.find((tool) => tool.routeSegment === routeSegment);
}
