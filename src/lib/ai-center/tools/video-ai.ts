import type { AiToolDefinition } from "@/lib/ai-center/tools/types";
import {
  buildVideoPromptGeneratorSystemPrompt,
  buildVideoPromptGeneratorPrompt,
  buildAiVideoScriptGeneratorSystemPrompt,
  buildAiVideoScriptGeneratorPrompt,
  buildStoryboardGeneratorSystemPrompt,
  buildStoryboardGeneratorPrompt,
  buildScenePlannerSystemPrompt,
  buildScenePlannerPrompt,
  buildShotListGeneratorSystemPrompt,
  buildShotListGeneratorPrompt,
  buildCameraMovementGeneratorSystemPrompt,
  buildCameraMovementGeneratorPrompt,
  buildCinematicPromptGeneratorSystemPrompt,
  buildCinematicPromptGeneratorPrompt,
  buildShortVideoGeneratorSystemPrompt,
  buildShortVideoGeneratorPrompt,
  buildYoutubeVideoOutlineGeneratorSystemPrompt,
  buildYoutubeVideoOutlineGeneratorPrompt,
  buildVideoProductionPlannerSystemPrompt,
  buildVideoProductionPlannerPrompt,
} from "@/lib/ai-center/tools/video-ai-prompts";

/**
 * Every fully-implemented Video AI tool, as a declarative definition the
 * generic AiGenerationForm engine can render — same pattern as every other
 * category (youtube.ts, instagram.ts, social-media.ts, blog-seo.ts,
 * email-marketing.ts, tiktok.ts, facebook.ts, linkedin.ts, image-ai.ts,
 * document-ai.ts).
 *
 * These tools never generate a video and never call an external provider
 * (no Runway, no Veo, no Kling, no Pika, no Luma, no Sora, no Higgsfield) —
 * they use the exact same local text engine as every other tool to produce
 * a prompt, script, shot list or production plan the user can take
 * elsewhere. The result still flows through UniversalResultViewer with its
 * default mediaKind="text" (see
 * src/components/workspace/universal-result-viewer.tsx), which already
 * accepts "video" as a future mediaKind — connecting a real video engine
 * later only means adding that provider's call and passing
 * mediaKind="video" for these tools' results; the UI itself needs no
 * changes.
 */
export const VIDEO_AI_TOOLS: AiToolDefinition[] = [
  {
    slug: "video-prompt-generator",
    routeSegment: "video-prompt",
    label: "Video Prompt Generator",
    description: "Genera un prompt de video detallado y agnóstico de motor, listo para pegar en tu generador preferido.",
    fields: [
      { name: "descripcion", label: "Descripción de la escena o video", type: "textarea", required: true, maxLength: 800 },
      { name: "estiloVisual", label: "Estilo visual", type: "text", required: true, maxLength: 200 },
      { name: "duracion", label: "Duración aproximada (opcional)", type: "text", maxLength: 50, placeholder: "ej. 15s, 1 min" },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildVideoPromptGeneratorSystemPrompt,
    buildUserPrompt: (v) =>
      buildVideoPromptGeneratorPrompt({ descripcion: v.descripcion, estiloVisual: v.estiloVisual, duracion: v.duracion, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt de video: ${v.descripcion}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "ai-video-script-generator",
    routeSegment: "script",
    label: "AI Video Script Generator",
    description: "Genera el guion completo de un video: introducción, desarrollo y cierre, ajustado a la duración objetivo.",
    fields: [
      { name: "tema", label: "Tema del video", type: "textarea", required: true, maxLength: 800 },
      { name: "duracion", label: "Duración objetivo", type: "text", required: true, maxLength: 50, placeholder: "ej. 3 minutos" },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Profesional y claro", maxLength: 150, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildAiVideoScriptGeneratorSystemPrompt,
    buildUserPrompt: (v) =>
      buildAiVideoScriptGeneratorPrompt({ tema: v.tema, duracion: v.duracion, tono: v.tono, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Guion de video: ${v.tema}`,
    contentType: "VIDEO_SCRIPT",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "storyboard-generator",
    routeSegment: "storyboard",
    label: "Storyboard Generator",
    description: "Describe un storyboard en texto, viñeta por viñeta, a partir de un guion o escena.",
    fields: [
      { name: "guionOEscena", label: "Guion o descripción de la escena", type: "textarea", required: true, maxLength: 4000 },
      { name: "cantidadVinetas", label: "Cantidad de viñetas deseada", type: "text", defaultValue: "Las necesarias para cubrir la escena", maxLength: 200 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildStoryboardGeneratorSystemPrompt,
    buildUserPrompt: (v) =>
      buildStoryboardGeneratorPrompt({ guionOEscena: v.guionOEscena, cantidadVinetas: v.cantidadVinetas, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: () => "Storyboard",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "scene-planner",
    routeSegment: "scene-planner",
    label: "Scene Planner",
    description: "Organiza los elementos clave de una escena a definir antes de rodar o generar, sin inventar ubicación ni personajes.",
    fields: [
      { name: "resumenEscena", label: "Resumen de la escena a planificar", type: "textarea", required: true, maxLength: 2000 },
      { name: "ubicacion", label: "Ubicación (si ya la tienes definida)", type: "text", maxLength: 200 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildScenePlannerSystemPrompt,
    buildUserPrompt: (v) => buildScenePlannerPrompt({ resumenEscena: v.resumenEscena, ubicacion: v.ubicacion, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: () => "Plan de escena",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "shot-list-generator",
    routeSegment: "shot-list",
    label: "Shot List Generator",
    description: "Genera una lista de planos numerada (tipo, ángulo y acción) para una escena.",
    fields: [
      { name: "escena", label: "Descripción de la escena", type: "textarea", required: true, maxLength: 2000 },
      { name: "estiloVisual", label: "Estilo visual (opcional)", type: "text", maxLength: 200 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildShotListGeneratorSystemPrompt,
    buildUserPrompt: (v) => buildShotListGeneratorPrompt({ escena: v.escena, estiloVisual: v.estiloVisual, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: () => "Lista de planos",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "camera-movement-generator",
    routeSegment: "camera-movement",
    label: "Camera Movement Generator",
    description: "Sugiere movimientos de cámara concretos que refuercen la sensación que quieres transmitir.",
    fields: [
      { name: "escena", label: "Descripción de la escena o toma", type: "textarea", required: true, maxLength: 1000 },
      { name: "sensacion", label: "Sensación que debe transmitir el movimiento", type: "text", required: true, maxLength: 200, placeholder: "ej. tensión, calma, energía" },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildCameraMovementGeneratorSystemPrompt,
    buildUserPrompt: (v) => buildCameraMovementGeneratorPrompt({ escena: v.escena, sensacion: v.sensacion, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Movimientos de cámara",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "cinematic-prompt-generator",
    routeSegment: "cinematic-prompt",
    label: "Cinematic Prompt Generator",
    description: "Genera un prompt con dirección cinematográfica clara: paleta, luz, lente y estilo.",
    fields: [
      { name: "descripcion", label: "Descripción de la escena", type: "textarea", required: true, maxLength: 800 },
      { name: "estiloCinematografico", label: "Estilo cinematográfico", type: "text", required: true, maxLength: 200, placeholder: "ej. thriller nocturno, drama cálido" },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildCinematicPromptGeneratorSystemPrompt,
    buildUserPrompt: (v) =>
      buildCinematicPromptGeneratorPrompt({ descripcion: v.descripcion, estiloCinematografico: v.estiloCinematografico, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt cinematográfico: ${v.descripcion}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "short-video-generator",
    routeSegment: "short-video",
    label: "Short Video Generator",
    description: "Genera el guion breve y el prompt visual de un video corto — no genera ningún archivo de vídeo.",
    fields: [
      { name: "tema", label: "Tema del video corto", type: "textarea", required: true, maxLength: 600 },
      { name: "plataforma", label: "Plataforma de destino (opcional)", type: "text", maxLength: 150, placeholder: "ej. TikTok, Reels, Shorts" },
      { name: "duracion", label: "Duración objetivo", type: "text", defaultValue: "30-60 segundos", maxLength: 50, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildShortVideoGeneratorSystemPrompt,
    buildUserPrompt: (v) =>
      buildShortVideoGeneratorPrompt({ tema: v.tema, plataforma: v.plataforma, duracion: v.duracion, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Video corto: ${v.tema}`,
    contentType: "VIDEO_SCRIPT",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "youtube-video-outline-generator",
    routeSegment: "youtube-outline",
    label: "YouTube Video Outline Generator",
    description: "Genera el esquema por secciones de un video de YouTube, con marcas de tiempo orientativas.",
    fields: [
      { name: "tema", label: "Tema del video de YouTube", type: "textarea", required: true, maxLength: 800 },
      { name: "duracionAprox", label: "Duración aproximada (opcional)", type: "text", maxLength: 50, placeholder: "ej. 10 minutos" },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildYoutubeVideoOutlineGeneratorSystemPrompt,
    buildUserPrompt: (v) => buildYoutubeVideoOutlineGeneratorPrompt({ tema: v.tema, duracionAprox: v.duracionAprox, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: (v) => `Outline: ${v.tema}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "video-production-planner",
    routeSegment: "production-planner",
    label: "Video Production Planner",
    description: "Genera un plan de producción por fases (preproducción, rodaje/generación, postproducción) para un proyecto de video.",
    fields: [
      { name: "proyecto", label: "Descripción del proyecto de video", type: "textarea", required: true, maxLength: 2000 },
      { name: "recursosDisponibles", label: "Recursos o restricciones disponibles (opcional)", type: "text", maxLength: 300 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildVideoProductionPlannerSystemPrompt,
    buildUserPrompt: (v) =>
      buildVideoProductionPlannerPrompt({ proyecto: v.proyecto, recursosDisponibles: v.recursosDisponibles, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Plan de producción de video",
    contentType: "OTHER",
    resultKind: "CAMPAIGN_PLAN",
  },
];

export function getVideoAiTool(routeSegment: string): AiToolDefinition | undefined {
  return VIDEO_AI_TOOLS.find((tool) => tool.routeSegment === routeSegment);
}
