/**
 * Pure prompt builders for the Image AI tools. Every system prompt takes
 * the project's real brand context (from buildBrandContext) — same rule
 * used by every other authenticated tool in this app: no separate AI
 * system, just a different prompt built on top of the shared local engine.
 *
 * IMPORTANT: these tools never generate an image. Their output is a single,
 * richly-detailed TEXT prompt the user can paste into an external image
 * generator (Midjourney, DALL·E, Stable Diffusion, Flux, etc.) themselves.
 * The local model only ever produces text — no image API is called or
 * integrated here, this phase or otherwise.
 *
 * None of this text is copied from any other category's prompts. Every
 * tool is explicitly told to only elaborate on aesthetic/technical
 * direction (style, lighting, composition, mood) and never invent facts
 * about the subject (identity, brand, content) the user didn't provide.
 */

const NO_ASSUMED_FACTS_RULE =
  "No inventes hechos sobre el sujeto que el usuario no te haya dado (identidad, marca, texto exacto, número de elementos, etc.) — solo elabora la dirección estética y técnica (estilo, iluminación, composición, ambiente, color).";

const ENGINE_AGNOSTIC_NOTE =
  "Escribe el prompt en lenguaje descriptivo natural, sin sintaxis de parámetros específica de ningún motor concreto (nada de flags tipo --ar o --v), para que funcione igual de bien en Midjourney, DALL·E, Stable Diffusion, Flux o cualquier otro generador de imágenes.";

export function buildImagePromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de imagen de AI Content Hub. No generas imágenes — solo escribes el prompt de texto que la persona usará en su generador de imágenes preferido.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "El prompt debe ser extremadamente detallado: sujeto, estilo artístico, iluminación, composición, paleta de color, ambiente y proporción sugerida.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildImagePromptPrompt(values: { descripcion: string; estilo: string; proporcion: string; idioma: string }): string {
  return [
    `Describe la imagen: ${values.descripcion}.`,
    `Estilo deseado: ${values.estilo}.`,
    values.proporcion ? `Proporción sugerida: ${values.proporcion}.` : "",
    `Idioma del prompt: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPhotoPromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de fotografía de AI Content Hub. No generas imágenes — solo escribes el prompt de texto para un generador de imágenes fotorrealistas.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "Incluye detalles técnicos fotográficos plausibles: tipo de toma, iluminación, lente/profundidad de campo y composición.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildPhotoPromptPrompt(values: { sujeto: string; tipoFoto: string; iluminacion: string; idioma: string }): string {
  return [
    `Sujeto: ${values.sujeto}.`,
    `Tipo de foto: ${values.tipoFoto}.`,
    `Iluminación: ${values.iluminacion}.`,
    `Idioma del prompt: ${values.idioma}.`,
  ].join("\n");
}

export function buildProductPhotographySystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de fotografía de producto de AI Content Hub. No generas imágenes — solo escribes el prompt de texto.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "El prompt debe describir un producto fotografiado de forma profesional: fondo, iluminación de estudio, ángulo y acabado, usando únicamente la descripción del producto que te den.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildProductPhotographyPrompt(values: { producto: string; entorno: string; iluminacion: string; idioma: string }): string {
  return [
    `Producto (usa solo esta descripción, no inventes marca ni características): ${values.producto}.`,
    `Entorno o fondo: ${values.entorno}.`,
    `Iluminación: ${values.iluminacion}.`,
    `Idioma del prompt: ${values.idioma}.`,
  ].join("\n");
}

export function buildLogoPromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de logotipos de AI Content Hub. No generas imágenes — solo escribes el prompt de texto.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "Describe un logotipo limpio y memorable: estilo (minimalista, geométrico, mascota, tipográfico, etc.), paleta de color y sensación que debe transmitir — nunca inventes el nombre de marca si no te lo dan.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildLogoPromptPrompt(values: { nombreMarca: string; estilo: string; colores: string; idioma: string }): string {
  return [
    `Nombre de marca: ${values.nombreMarca}.`,
    `Estilo deseado: ${values.estilo}.`,
    values.colores ? `Colores: ${values.colores}.` : "",
    `Idioma del prompt: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPosterPromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de carteles (posters) de AI Content Hub. No generas imágenes — solo escribes el prompt de texto.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "Describe la composición del cartel: jerarquía visual, estilo gráfico y espacio para el texto indicado — deja claro que la generación de texto legible dentro de la imagen no está garantizada por los generadores de imagen actuales.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildPosterPromptPrompt(values: { tema: string; estiloVisual: string; textoIncluir: string; idioma: string }): string {
  return [
    `Tema o evento: ${values.tema}.`,
    `Estilo visual: ${values.estiloVisual}.`,
    values.textoIncluir ? `Texto que debería aparecer en el cartel: ${values.textoIncluir}.` : "",
    `Idioma del prompt: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSocialImagePromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de imágenes para redes sociales de AI Content Hub. No generas imágenes — solo escribes el prompt de texto.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "Ten en cuenta el formato típico de la plataforma indicada (cuadrado, vertical, etc.) al sugerir la proporción, sin asumir reglas específicas de ninguna plataforma que no te hayan dado.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildSocialImagePromptPrompt(values: { tema: string; plataforma: string; estilo: string; idioma: string }): string {
  return [
    `Tema de la imagen: ${values.tema}.`,
    `Plataforma de destino: ${values.plataforma}.`,
    `Estilo: ${values.estilo}.`,
    `Idioma del prompt: ${values.idioma}.`,
  ].join("\n");
}

export function buildThumbnailPromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de miniaturas (thumbnails) de vídeo de AI Content Hub. No generas imágenes — solo escribes el prompt de texto.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "Una miniatura debe leerse de un vistazo: pocos elementos, alto contraste y una expresión o composición clara que comunique el tema del vídeo.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildThumbnailPromptPrompt(values: { tema: string; estiloVisual: string; elementosClave: string; idioma: string }): string {
  return [
    `Tema del vídeo: ${values.tema}.`,
    `Estilo visual: ${values.estiloVisual}.`,
    values.elementosClave ? `Elementos clave a incluir: ${values.elementosClave}.` : "",
    `Idioma del prompt: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCharacterPromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de personajes de AI Content Hub. No generas imágenes — solo escribes el prompt de texto.",
    NO_ASSUMED_FACTS_RULE,
    "No inventes rasgos físicos, identidad, edad ni ningún detalle del personaje que la persona no te haya descrito explícitamente — elabora únicamente el estilo artístico y la pose/ambiente.",
    ENGINE_AGNOSTIC_NOTE,
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildCharacterPromptPrompt(values: { descripcionPersonaje: string; estiloArtistico: string; idioma: string }): string {
  return [
    `Idioma del prompt: ${values.idioma}.`,
    `Estilo artístico: ${values.estiloArtistico}.`,
    "Descripción del personaje dada por la persona (usa solo esto, no añadas rasgos nuevos):",
    `"""${values.descripcionPersonaje}"""`,
  ].join("\n");
}

export function buildBackgroundPromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de fondos y escenarios de AI Content Hub. No generas imágenes — solo escribes el prompt de texto.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "Describe el escenario con profundidad: primer plano, plano medio y fondo, además de iluminación y ambiente general.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildBackgroundPromptPrompt(values: { escenario: string; estiloVisual: string; iluminacion: string; idioma: string }): string {
  return [
    `Escenario o ambiente: ${values.escenario}.`,
    `Estilo visual: ${values.estiloVisual}.`,
    `Iluminación: ${values.iluminacion}.`,
    `Idioma del prompt: ${values.idioma}.`,
  ].join("\n");
}

export function buildStyleTransferPromptSystemPrompt(context: string): string {
  return [
    "Eres el generador de prompts de transferencia de estilo de AI Content Hub. No generas imágenes — solo escribes el prompt de texto.",
    NO_ASSUMED_FACTS_RULE,
    ENGINE_AGNOSTIC_NOTE,
    "Combina la descripción del contenido base con el estilo artístico objetivo en un único prompt coherente, sin inventar nada del contenido base que no te hayan dado.",
    "Devuelve únicamente el prompt final, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildStyleTransferPromptPrompt(values: { contenidoBase: string; estiloObjetivo: string; idioma: string }): string {
  return [
    `Estilo objetivo a aplicar: ${values.estiloObjetivo}.`,
    `Idioma del prompt: ${values.idioma}.`,
    "Contenido base descrito por la persona (usa solo esto, no inventes más):",
    `"""${values.contenidoBase}"""`,
  ].join("\n");
}
