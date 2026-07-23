import type { z } from "zod";
import type { generateContentSchema } from "@/lib/validation/content";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  ARTICLE: "un artículo",
  BLOG_POST: "una entrada de blog",
  PRODUCT_DESCRIPTION: "una descripción de producto",
  EMAIL: "un correo electrónico",
  NEWSLETTER: "un boletín",
  VIDEO_SCRIPT: "un guion de video",
  AD: "un anuncio publicitario",
  LANDING_PAGE: "el texto de una página de venta",
  SERVICE_DESCRIPTION: "una descripción de servicio",
  FAQ: "una sección de preguntas frecuentes",
  CALL_TO_ACTION: "un llamado a la acción",
  SOCIAL_TEXT: "un texto para redes sociales",
  TITLE: "un título",
  INTRO: "una introducción",
  CONCLUSION: "una conclusión",
  SUMMARY: "un resumen",
  OTHER: "una pieza de contenido",
};

export function buildContentGenerationSystemPrompt(brandContext: string): string {
  return [
    "Eres el redactor de contenido de AI Content Hub, una plataforma SaaS de marketing.",
    "Escribe siempre en el idioma solicitado y respeta estrictamente las palabras prohibidas indicadas.",
    "No inventes datos, cifras, testimonios ni afirmaciones que no se puedan verificar.",
    "No prometas resultados de posicionamiento en buscadores.",
    "Devuelve únicamente el contenido final, sin explicaciones ni comentarios meta sobre lo que has hecho.",
    "",
    "Contexto del proyecto:",
    brandContext,
  ].join("\n");
}

export function buildContentGenerationPrompt(input: z.infer<typeof generateContentSchema>): string {
  const typeLabel = CONTENT_TYPE_LABELS[input.type] ?? "una pieza de contenido";
  const lines = [`Escribe ${typeLabel} sobre: ${input.topic}.`];
  if (input.objective) lines.push(`Objetivo: ${input.objective}.`);
  if (input.audience) lines.push(`Audiencia: ${input.audience}.`);
  if (input.tone) lines.push(`Tono solicitado: ${input.tone}.`);
  if (input.keywords) lines.push(`Palabras clave a incluir de forma natural: ${input.keywords}.`);
  if (input.forbiddenWords) lines.push(`Palabras que debes evitar: ${input.forbiddenWords}.`);
  if (input.cta) lines.push(`Incluye este llamado a la acción: ${input.cta}.`);
  lines.push(`Escribe en idioma: ${input.language}.`);
  return lines.join("\n");
}
