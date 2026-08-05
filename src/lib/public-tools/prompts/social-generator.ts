import { buildMultiPlatformPostSystemPrompt, buildMultiPlatformPostPrompt } from "@/lib/ai-capabilities/multi-platform-post/prompt";

/**
 * Fase 41 correction: this file no longer defines its own "generate a post
 * for a platform" prompt — it composes the shared
 * `src/lib/ai-capabilities/multi-platform-post/prompt.ts` core (the same one
 * AI Center's Social Media multi-platform-post tool calls), passing the
 * single selected platform as `plataformas` and folding this tool's extra
 * structured-output request (hook/CTA/hashtags/short version/alternative
 * version) and platform-format guidance into the `context` argument that
 * core already accepts.
 */
export type SocialPlatform = "instagram" | "tiktok" | "facebook" | "linkedin" | "youtube" | "x";

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X" },
];

const PLATFORM_FORMAT: Record<SocialPlatform, string> = {
  instagram: "Formato Instagram: pie de foto cercano, con saltos de línea cortos y espacio para 3-5 hashtags al final.",
  tiktok: "Formato TikTok: guion corto con un gancho en el primer segundo, cuerpo dinámico en frases breves y un cierre con llamada a la acción.",
  facebook: "Formato Facebook: publicación algo más larga y conversacional, adecuada para generar comentarios.",
  linkedin: "Formato LinkedIn: tono profesional, con una idea clara por párrafo y una reflexión final.",
  youtube: "Formato YouTube: descripción de vídeo con un primer párrafo-resumen (se muestra antes del 'ver más') y contexto adicional después.",
  x: "Formato X: publicación breve, directa y concisa, dentro de 280 caracteres.",
};

export interface SocialGeneratorInput {
  platform: SocialPlatform;
  topic: string;
  goal: string;
  audience: string;
  tone: string;
  length: string;
  hashtagCount: number;
  mustInclude?: string;
}

function buildExtraContext(input: SocialGeneratorInput): string {
  return [
    PLATFORM_FORMAT[input.platform],
    "No inventes tendencias, cifras ni datos de popularidad. Los hashtags deben derivarse únicamente del tema y contenido proporcionados.",
    `Objetivo: ${input.goal}.`,
    `Público: ${input.audience}.`,
    `Longitud deseada: ${input.length}.`,
    `Cantidad de hashtags: ${input.hashtagCount}.`,
    input.mustInclude ? `Información obligatoria a incluir: ${input.mustInclude}.` : null,
    "Responde exactamente con este formato, sin texto adicional fuera de las etiquetas:",
    "TEXTO_PRINCIPAL:\n...\nGANCHO:\n...\nCTA:\n...\nHASHTAGS:\n...\nVERSION_CORTA:\n...\nVERSION_ALTERNATIVA:\n...",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSocialGeneratorSystemPrompt(input: SocialGeneratorInput): string {
  return buildMultiPlatformPostSystemPrompt(buildExtraContext(input));
}

export function buildSocialGeneratorPrompt(input: SocialGeneratorInput): string {
  const platformLabel = SOCIAL_PLATFORMS.find((p) => p.id === input.platform)?.label ?? input.platform;
  return buildMultiPlatformPostPrompt({ tema: input.topic, plataformas: platformLabel, tono: input.tone, idioma: "es" });
}

export const SOCIAL_GENERATOR_SECTION_LABELS = ["TEXTO_PRINCIPAL", "GANCHO", "CTA", "HASHTAGS", "VERSION_CORTA", "VERSION_ALTERNATIVA"];
