import type { AiToolDefinition } from "@/lib/ai-center/tools/types";
import {
  buildImagePromptSystemPrompt,
  buildImagePromptPrompt,
  buildPhotoPromptSystemPrompt,
  buildPhotoPromptPrompt,
  buildProductPhotographySystemPrompt,
  buildProductPhotographyPrompt,
  buildLogoPromptSystemPrompt,
  buildLogoPromptPrompt,
  buildPosterPromptSystemPrompt,
  buildPosterPromptPrompt,
  buildSocialImagePromptSystemPrompt,
  buildSocialImagePromptPrompt,
  buildThumbnailPromptSystemPrompt,
  buildThumbnailPromptPrompt,
  buildCharacterPromptSystemPrompt,
  buildCharacterPromptPrompt,
  buildBackgroundPromptSystemPrompt,
  buildBackgroundPromptPrompt,
  buildStyleTransferPromptSystemPrompt,
  buildStyleTransferPromptPrompt,
} from "@/lib/ai-center/tools/image-ai-prompts";

/**
 * Every fully-implemented Image AI tool, as a declarative definition the
 * generic AiGenerationForm engine can render — same pattern as every other
 * category (youtube.ts, instagram.ts, social-media.ts, blog-seo.ts,
 * email-marketing.ts, tiktok.ts, facebook.ts, linkedin.ts).
 *
 * These tools never generate an image and never call an external provider
 * (no OpenAI Images, no Stable Diffusion, no Flux, no Midjourney, no
 * DALL·E) — they use the exact same local text engine as every other tool
 * to produce one detailed text prompt the user can paste elsewhere. The
 * result still flows through UniversalResultViewer with its default
 * mediaKind="text" (see src/components/workspace/universal-result-viewer.tsx,
 * built two phases ago), which already accepts "image" as a future
 * mediaKind — connecting a real image provider later only means adding
 * that provider's call and passing mediaKind="image" for these tools'
 * results; the UI itself needs no changes.
 */
export const IMAGE_AI_TOOLS: AiToolDefinition[] = [
  {
    slug: "image-prompt-generator",
    routeSegment: "image-prompt",
    label: "Image Prompt Generator",
    description: "Genera un prompt de imagen detallado y agnóstico de motor, listo para pegar en tu generador preferido.",
    fields: [
      { name: "descripcion", label: "Descripción de la imagen", type: "textarea", required: true, maxLength: 800 },
      { name: "estilo", label: "Estilo deseado", type: "text", required: true, maxLength: 200 },
      { name: "proporcion", label: "Proporción (opcional)", type: "text", maxLength: 50, placeholder: "ej. 1:1, 16:9" },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildImagePromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildImagePromptPrompt({ descripcion: v.descripcion, estilo: v.estilo, proporcion: v.proporcion, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt de imagen: ${v.descripcion}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "photo-prompt-generator",
    routeSegment: "photo-prompt",
    label: "Photo Prompt Generator",
    description: "Genera un prompt de fotografía fotorrealista con detalles técnicos.",
    fields: [
      { name: "sujeto", label: "Sujeto", type: "textarea", required: true, maxLength: 500 },
      { name: "tipoFoto", label: "Tipo de foto", type: "text", required: true, maxLength: 150, placeholder: "ej. retrato, paisaje" },
      { name: "iluminacion", label: "Iluminación", type: "text", defaultValue: "Luz natural suave", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildPhotoPromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildPhotoPromptPrompt({ sujeto: v.sujeto, tipoFoto: v.tipoFoto, iluminacion: v.iluminacion, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt de foto: ${v.sujeto}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "product-photography-prompt",
    routeSegment: "product-photography",
    label: "Product Photography Prompt",
    description: "Genera un prompt de fotografía de producto profesional, usando solo la descripción que proporciones.",
    fields: [
      { name: "producto", label: "Producto", type: "textarea", required: true, maxLength: 500 },
      { name: "entorno", label: "Entorno o fondo", type: "text", defaultValue: "Fondo de estudio neutro", maxLength: 200, required: true },
      { name: "iluminacion", label: "Iluminación", type: "text", defaultValue: "Iluminación de estudio suave", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildProductPhotographySystemPrompt,
    buildUserPrompt: (v) =>
      buildProductPhotographyPrompt({ producto: v.producto, entorno: v.entorno, iluminacion: v.iluminacion, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt de producto: ${v.producto}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "logo-prompt-generator",
    routeSegment: "logo-prompt",
    label: "Logo Prompt Generator",
    description: "Genera un prompt para un logotipo limpio y memorable.",
    fields: [
      { name: "nombreMarca", label: "Nombre de marca", type: "text", required: true, maxLength: 150 },
      { name: "estilo", label: "Estilo deseado", type: "text", required: true, maxLength: 200, placeholder: "ej. minimalista, geométrico" },
      { name: "colores", label: "Colores (opcional)", type: "text", maxLength: 150 },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildLogoPromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildLogoPromptPrompt({ nombreMarca: v.nombreMarca, estilo: v.estilo, colores: v.colores, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt de logo: ${v.nombreMarca}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "poster-prompt-generator",
    routeSegment: "poster-prompt",
    label: "Poster Prompt Generator",
    description: "Genera un prompt de cartel con jerarquía visual clara.",
    fields: [
      { name: "tema", label: "Tema o evento", type: "textarea", required: true, maxLength: 500 },
      { name: "estiloVisual", label: "Estilo visual", type: "text", required: true, maxLength: 200 },
      { name: "textoIncluir", label: "Texto a incluir (opcional)", type: "text", maxLength: 300 },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildPosterPromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildPosterPromptPrompt({ tema: v.tema, estiloVisual: v.estiloVisual, textoIncluir: v.textoIncluir, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt de cartel: ${v.tema}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "social-media-image-prompt",
    routeSegment: "social-image-prompt",
    label: "Social Media Image Prompt",
    description: "Genera un prompt de imagen pensado para una plataforma social concreta.",
    fields: [
      { name: "tema", label: "Tema de la imagen", type: "textarea", required: true, maxLength: 500 },
      { name: "plataforma", label: "Plataforma de destino", type: "text", required: true, maxLength: 150 },
      { name: "estilo", label: "Estilo", type: "text", defaultValue: "Fotorrealista", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildSocialImagePromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildSocialImagePromptPrompt({ tema: v.tema, plataforma: v.plataforma, estilo: v.estilo, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt social: ${v.tema}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "thumbnail-prompt-generator",
    routeSegment: "thumbnail-prompt",
    label: "Thumbnail Prompt Generator",
    description: "Genera un prompt de miniatura de vídeo con alto contraste y lectura rápida.",
    fields: [
      { name: "tema", label: "Tema del vídeo", type: "textarea", required: true, maxLength: 500 },
      { name: "estiloVisual", label: "Estilo visual", type: "text", defaultValue: "Alto contraste, llamativo", maxLength: 200, required: true },
      { name: "elementosClave", label: "Elementos clave (opcional)", type: "text", maxLength: 300 },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildThumbnailPromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildThumbnailPromptPrompt({ tema: v.tema, estiloVisual: v.estiloVisual, elementosClave: v.elementosClave, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt de miniatura: ${v.tema}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "character-prompt-generator",
    routeSegment: "character-prompt",
    label: "Character Prompt Generator",
    description: "Genera un prompt de personaje usando únicamente la descripción que proporciones.",
    fields: [
      { name: "descripcionPersonaje", label: "Descripción del personaje", type: "textarea", required: true, maxLength: 1000 },
      { name: "estiloArtistico", label: "Estilo artístico", type: "text", required: true, maxLength: 200 },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildCharacterPromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildCharacterPromptPrompt({ descripcionPersonaje: v.descripcionPersonaje, estiloArtistico: v.estiloArtistico, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: () => "Prompt de personaje",
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "background-prompt-generator",
    routeSegment: "background-prompt",
    label: "Background Prompt Generator",
    description: "Genera un prompt de fondo o escenario con profundidad visual.",
    fields: [
      { name: "escenario", label: "Escenario o ambiente", type: "textarea", required: true, maxLength: 500 },
      { name: "estiloVisual", label: "Estilo visual", type: "text", required: true, maxLength: 200 },
      { name: "iluminacion", label: "Iluminación", type: "text", defaultValue: "Luz natural suave", maxLength: 200, required: true },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildBackgroundPromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildBackgroundPromptPrompt({ escenario: v.escenario, estiloVisual: v.estiloVisual, iluminacion: v.iluminacion, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Prompt de fondo: ${v.escenario}`,
    contentType: "OTHER",
    resultKind: "CONTENT_GENERATION",
  },
  {
    slug: "style-transfer-prompt",
    routeSegment: "style-transfer",
    label: "Style Transfer Prompt Generator",
    description: "Combina un contenido base con un estilo artístico objetivo en un único prompt.",
    fields: [
      { name: "contenidoBase", label: "Contenido base", type: "textarea", required: true, maxLength: 800 },
      { name: "estiloObjetivo", label: "Estilo objetivo", type: "text", required: true, maxLength: 200 },
      { name: "idioma", label: "Idioma del prompt", type: "text", defaultValue: "es", maxLength: 10, required: true },
    ],
    buildSystemPrompt: buildStyleTransferPromptSystemPrompt,
    buildUserPrompt: (v) =>
      buildStyleTransferPromptPrompt({ contenidoBase: v.contenidoBase, estiloObjetivo: v.estiloObjetivo, idioma: v.idioma }),
    outputMode: "text",
    buildItemTitle: (v) => `Style transfer: ${v.estiloObjetivo}`,
    contentType: "OTHER",
    resultKind: "ADAPTATION",
  },
];

export function getImageAiTool(routeSegment: string): AiToolDefinition | undefined {
  return IMAGE_AI_TOOLS.find((tool) => tool.routeSegment === routeSegment);
}
