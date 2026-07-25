/**
 * Pure prompt builders for the YouTube AI tools. Every system prompt takes
 * the project's real brand context (from buildBrandContext) — same rule
 * used by every other authenticated tool in this app: no separate AI
 * system, just a different prompt built on top of the shared local engine.
 */

export function buildYoutubeTitlesSystemPrompt(context: string): string {
  return [
    "Eres el generador de títulos de YouTube de AI Content Hub.",
    "Genera títulos con gancho, claros y sin clickbait engañoso — nunca prometas algo que el vídeo no cumple.",
    "No inventes cifras, cronologías ni datos que no se puedan verificar.",
    "Devuelve únicamente una lista numerada de títulos, uno por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeTitlesPrompt(values: {
  tema: string;
  nicho: string;
  audiencia: string;
  idioma: string;
  tono: string;
  cantidad: string;
}): string {
  return [
    `Genera ${values.cantidad} títulos de YouTube sobre: ${values.tema}.`,
    values.nicho ? `Nicho del canal: ${values.nicho}.` : "",
    values.audiencia ? `Audiencia objetivo: ${values.audiencia}.` : "",
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildYoutubeDescriptionSystemPrompt(context: string): string {
  return [
    "Eres el generador de descripciones de YouTube de AI Content Hub.",
    "Redacta una descripción optimizada para YouTube: primeras líneas con gancho (se ven antes del \"Mostrar más\"),",
    "cuerpo claro y palabras clave relevantes de forma natural, sin relleno ni listas de hashtags.",
    "No inventes datos, enlaces ni cifras que no te hayan dado.",
    "Devuelve únicamente el texto de la descripción, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeDescriptionPrompt(values: {
  tema: string;
  resumen: string;
  palabrasClave: string;
  idioma: string;
  tono: string;
}): string {
  return [
    `Tema del vídeo: ${values.tema}.`,
    `Resumen del contenido: ${values.resumen}.`,
    values.palabrasClave ? `Palabras clave a incluir de forma natural: ${values.palabrasClave}.` : "",
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildYoutubeHashtagsSystemPrompt(context: string): string {
  return [
    "Eres el generador de hashtags de YouTube de AI Content Hub.",
    "Genera hashtags relevantes y específicos del tema y nicho — evita hashtags genéricos que no aporten descubribilidad.",
    "Devuelve únicamente una lista de hashtags, uno por línea, cada uno empezando por #, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeHashtagsPrompt(values: { tema: string; nicho: string; idioma: string }): string {
  return [
    `Genera hashtags de YouTube sobre: ${values.tema}.`,
    values.nicho ? `Nicho del canal: ${values.nicho}.` : "",
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildYoutubeTagsSystemPrompt(context: string): string {
  return [
    "Eres el generador de etiquetas SEO de YouTube de AI Content Hub.",
    "Genera etiquetas (tags) de búsqueda relevantes para el buscador de YouTube: variantes del tema, sinónimos y términos relacionados.",
    "Nunca repitas la misma etiqueta dos veces ni generes variantes triviales de mayúsculas/minúsculas o plural/singular.",
    "Devuelve únicamente una lista de etiquetas, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeTagsPrompt(values: { tema: string; nicho: string; idioma: string }): string {
  return [
    `Genera etiquetas SEO de YouTube para un vídeo sobre: ${values.tema}.`,
    values.nicho ? `Nicho del canal: ${values.nicho}.` : "",
    `Idioma: ${values.idioma}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildYoutubeHooksSystemPrompt(context: string): string {
  return [
    "Eres el generador de hooks (primeros segundos) de vídeos de YouTube de AI Content Hub.",
    "Cada opción debe enganchar en las primeras frases: pregunta, tensión, promesa concreta o dato sorprendente — nunca genérico.",
    "No inventes datos ni cifras que no se puedan verificar.",
    "Devuelve únicamente una lista numerada de opciones de hook, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeHooksPrompt(values: { tema: string; tono: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} hooks (primeros segundos) para un vídeo de YouTube sobre: ${values.tema}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildYoutubeChaptersSystemPrompt(context: string): string {
  return [
    "Eres el generador de capítulos de YouTube de AI Content Hub.",
    "Genera una línea de tiempo completa de capítulos con marcas de tiempo en formato mm:ss, empezando siempre en 00:00.",
    "Los capítulos deben cubrir toda la duración indicada de forma proporcional y seguir la estructura proporcionada.",
    "Devuelve únicamente la lista de capítulos, uno por línea, en formato 'mm:ss Título del capítulo', sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeChaptersPrompt(values: { tema: string; estructura: string; duracion: string }): string {
  return [
    `Genera los capítulos para un vídeo de YouTube sobre: ${values.tema}.`,
    `Estructura o secciones a cubrir: ${values.estructura}.`,
    `Duración aproximada del vídeo: ${values.duracion} minutos.`,
  ].join("\n");
}

export function buildYoutubeIdeasSystemPrompt(context: string): string {
  return [
    "Eres el generador de ideas de vídeo de YouTube de AI Content Hub.",
    "Organiza las ideas agrupadas por categoría, con un encabezado de categoría seguido de sus ideas.",
    "Genera ideas variadas y accionables — nunca genéricas o repetitivas entre sí.",
    "Formato: 'Categoría:' en su propia línea, seguida de las ideas de esa categoría cada una en su línea empezando por '- '.",
    "No añadas explicaciones adicionales fuera de ese formato.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeIdeasPrompt(values: { nicho: string; idioma: string; cantidad: string }): string {
  return [
    `Genera ${values.cantidad} ideas de vídeo para un canal de YouTube del nicho: ${values.nicho}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}

export function buildYoutubeScriptSystemPrompt(context: string): string {
  return [
    "Eres el generador de guiones de YouTube de AI Content Hub.",
    "Genera un guion completo con cuatro secciones claramente tituladas: Introducción, Desarrollo, Llamado a la acción y Conclusión.",
    "No inventes datos, cifras ni afirmaciones que no se puedan verificar.",
    "Devuelve únicamente el guion con esas cuatro secciones tituladas, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export function buildYoutubeScriptPrompt(values: { tema: string; duracion: string; tono: string; idioma: string }): string {
  return [
    `Genera el guion completo de un vídeo de YouTube sobre: ${values.tema}.`,
    `Duración aproximada: ${values.duracion} minutos.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}
