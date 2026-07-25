import type { AiToolDefinition } from "@/lib/ai-center/tools/types";
import {
  buildSeoTitleSystemPrompt,
  buildSeoTitlePrompt,
  buildMetaDescriptionSystemPrompt,
  buildMetaDescriptionPrompt,
  buildKeywordResearchSystemPrompt,
  buildKeywordResearchPrompt,
  buildBlogOutlineSystemPrompt,
  buildBlogOutlinePrompt,
  buildBlogWriterSystemPrompt,
  buildBlogWriterPrompt,
  buildFaqSystemPrompt,
  buildFaqPrompt,
  buildInternalLinkingSystemPrompt,
  buildInternalLinkingPrompt,
  buildSnippetOptimizerSystemPrompt,
  buildSnippetOptimizerPrompt,
  buildArticleRewriterSystemPrompt,
  buildArticleRewriterPrompt,
  buildSeoContentOptimizerSystemPrompt,
  buildSeoContentOptimizerPrompt,
} from "@/lib/ai-center/tools/blog-seo-prompts";

/**
 * Every fully-implemented Blog & SEO AI tool, as a declarative definition
 * the generic AiGenerationForm engine can render — same pattern as
 * youtube.ts, instagram.ts and social-media.ts. Registering these in
 * src/lib/ai-center/tools/registry.ts is the only wiring Chat IA's intent
 * router needs to start using them automatically.
 */
export const BLOG_SEO_TOOLS: AiToolDefinition[] = [
  {
    slug: "seo-title",
    routeSegment: "title",
    label: "SEO Title Generator",
    description: "Genera títulos SEO de hasta 60 caracteres con la palabra clave objetivo.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "palabraClave", label: "Palabra clave objetivo", type: "text", required: true, maxLength: 150 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de opciones", type: "number", defaultValue: 5, min: 1, max: 10, required: true },
    ],
    buildSystemPrompt: buildSeoTitleSystemPrompt,
    buildUserPrompt: (v) => buildSeoTitlePrompt({ tema: v.tema, palabraClave: v.palabraClave, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "list",
    buildItemTitle: (v) => `Títulos SEO: ${v.tema}`,
    contentType: "TITLE",
    resultKind: "SEO_SUGGESTION",
  },
  {
    slug: "seo-meta-description",
    routeSegment: "meta-description",
    label: "Meta Description Generator",
    description: "Genera meta descripciones de 140-160 caracteres con la palabra clave objetivo.",
    fields: [
      { name: "tema", label: "Tema de la página", type: "textarea", required: true, maxLength: 500 },
      { name: "palabraClave", label: "Palabra clave objetivo", type: "text", required: true, maxLength: 150 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de opciones", type: "number", defaultValue: 3, min: 1, max: 10, required: true },
    ],
    buildSystemPrompt: buildMetaDescriptionSystemPrompt,
    buildUserPrompt: (v) =>
      buildMetaDescriptionPrompt({ tema: v.tema, palabraClave: v.palabraClave, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "list",
    buildItemTitle: (v) => `Meta descripción: ${v.tema}`,
    contentType: "OTHER",
    resultKind: "SEO_SUGGESTION",
  },
  {
    slug: "seo-keyword-research",
    routeSegment: "keyword-research",
    label: "Keyword Research Assistant",
    description: "Sugiere variantes semánticas y preguntas relacionadas para un tema, sin inventar métricas reales.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildKeywordResearchSystemPrompt,
    buildUserPrompt: (v) => buildKeywordResearchPrompt({ tema: v.tema, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Keyword research: ${v.tema}`,
    contentType: "OTHER",
    resultKind: "SEO_SUGGESTION",
  },
  {
    slug: "seo-blog-outline",
    routeSegment: "blog-outline",
    label: "Blog Outline Generator",
    description: "Genera un esquema de encabezados H1/H2/H3 para un artículo de blog.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "palabraClave", label: "Palabra clave objetivo", type: "text", required: true, maxLength: 150 },
      { name: "secciones", label: "Número de secciones", type: "number", defaultValue: 6, min: 3, max: 15, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildBlogOutlineSystemPrompt,
    buildUserPrompt: (v) =>
      buildBlogOutlinePrompt({ tema: v.tema, palabraClave: v.palabraClave, secciones: v.secciones, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: (v) => `Esquema de blog: ${v.tema}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "seo-blog-writer",
    routeSegment: "blog-writer",
    label: "Complete Blog Writer",
    description: "Redacta un artículo de blog completo con encabezados y la palabra clave integrada de forma natural.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "palabraClave", label: "Palabra clave objetivo", type: "text", required: true, maxLength: 150 },
      { name: "esquema", label: "Esquema a seguir (opcional)", type: "textarea", maxLength: 2000 },
      { name: "tono", label: "Tono", type: "text", defaultValue: "Cercano y profesional", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "longitud", label: "Longitud aproximada (palabras)", type: "number", defaultValue: 800, min: 200, max: 3000, required: true },
    ],
    buildSystemPrompt: buildBlogWriterSystemPrompt,
    buildUserPrompt: (v) =>
      buildBlogWriterPrompt({
        tema: v.tema,
        palabraClave: v.palabraClave,
        esquema: v.esquema,
        tono: v.tono,
        idioma: v.idioma,
        longitud: v.longitud,
      }),
    outputMode: "text",
    buildItemTitle: (v) => `Artículo: ${v.tema}`,
    contentType: "BLOG_POST",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "seo-faq",
    routeSegment: "faq",
    label: "FAQ Generator",
    description: "Genera preguntas frecuentes con respuestas breves, listas para datos estructurados FAQ.",
    fields: [
      { name: "tema", label: "Tema", type: "textarea", required: true, maxLength: 500 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
      { name: "cantidad", label: "Cantidad de preguntas", type: "number", defaultValue: 6, min: 1, max: 15, required: true },
    ],
    buildSystemPrompt: buildFaqSystemPrompt,
    buildUserPrompt: (v) => buildFaqPrompt({ tema: v.tema, idioma: v.idioma, cantidad: v.cantidad }),
    outputMode: "list",
    buildItemTitle: (v) => `FAQ: ${v.tema}`,
    contentType: "FAQ",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "seo-internal-links",
    routeSegment: "internal-links",
    label: "Internal Linking Suggestions",
    description: "Sugiere texto ancla y destinos de enlazado interno para un contenido.",
    fields: [
      { name: "contenido", label: "Contenido", type: "textarea", required: true, maxLength: 8000 },
      { name: "paginasDisponibles", label: "Páginas o temas disponibles (opcional)", type: "textarea", maxLength: 1000 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildInternalLinkingSystemPrompt,
    buildUserPrompt: (v) =>
      buildInternalLinkingPrompt({ contenido: v.contenido, paginasDisponibles: v.paginasDisponibles, idioma: v.idioma }),
    outputMode: "list",
    buildItemTitle: () => "Sugerencias de enlazado interno",
    contentType: "OTHER",
    resultKind: "SEO_SUGGESTION",
  },
  {
    slug: "seo-snippet-optimizer",
    routeSegment: "snippet-optimizer",
    label: "Featured Snippet Optimizer",
    description: "Redacta una respuesta optimizada para ganar el featured snippet de una pregunta.",
    fields: [
      { name: "pregunta", label: "Pregunta objetivo", type: "textarea", required: true, maxLength: 300 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildSnippetOptimizerSystemPrompt,
    buildUserPrompt: (v) => buildSnippetOptimizerPrompt({ pregunta: v.pregunta, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Snippet: ${v.pregunta}`,
    contentType: "OTHER",
    resultKind: "SEO_SUGGESTION",
  },
  {
    slug: "seo-article-rewriter",
    routeSegment: "rewriter",
    label: "Article Rewriter",
    description: "Reescribe un artículo conservando los hechos originales, mejorando claridad y SEO on-page.",
    fields: [
      { name: "contenidoOriginal", label: "Artículo original", type: "textarea", required: true, maxLength: 8000 },
      { name: "objetivo", label: "Objetivo de la reescritura", type: "text", defaultValue: "Mejorar claridad y SEO", maxLength: 300, required: true },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildArticleRewriterSystemPrompt,
    buildUserPrompt: (v) =>
      buildArticleRewriterPrompt({ contenidoOriginal: v.contenidoOriginal, objetivo: v.objetivo, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Artículo reescrito",
    contentType: "OTHER",
    resultKind: "REWRITE",
  },
  {
    slug: "seo-content-optimizer",
    routeSegment: "content-optimizer",
    label: "SEO Content Optimizer",
    description: "Analiza un contenido y sugiere mejoras de SEO on-page, sin inventar datos de posicionamiento real.",
    fields: [
      { name: "contenido", label: "Contenido a optimizar", type: "textarea", required: true, maxLength: 8000 },
      { name: "palabraClave", label: "Palabra clave objetivo", type: "text", required: true, maxLength: 150 },
      { name: "idioma", label: "Idioma", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildSeoContentOptimizerSystemPrompt,
    buildUserPrompt: (v) =>
      buildSeoContentOptimizerPrompt({ contenido: v.contenido, palabraClave: v.palabraClave, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Optimización SEO: ${v.palabraClave}`,
    contentType: "OTHER",
    resultKind: "SEO_SUGGESTION",
  },
];

export function getBlogSeoTool(routeSegment: string): AiToolDefinition | undefined {
  return BLOG_SEO_TOOLS.find((tool) => tool.routeSegment === routeSegment);
}
