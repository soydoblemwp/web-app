/**
 * The single "generate SEO titles" capability, shared by AI Center's Blog &
 * SEO title generator (re-exported under its original
 * `buildSeoTitleSystemPrompt`/`buildSeoTitlePrompt` names) and the public
 * `/herramientas/generador-titulos-meta-descripciones` tool.
 */
export function buildSeoTitlesSystemPrompt(context: string): string {
  return [
    "Eres el generador de títulos SEO de AI Content Hub.",
    "Cada título debe incluir la palabra clave objetivo de forma natural y no superar los 60 caracteres para no cortarse en los resultados de Google.",
    "Prioriza claridad y valor real para quien busca, nunca clickbait vacío.",
    "Devuelve únicamente una lista numerada de opciones de título, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export interface SeoTitlesValues {
  tema: string;
  palabraClave: string;
  idioma: string;
  cantidad: string;
}

export function buildSeoTitlesPrompt(values: SeoTitlesValues): string {
  return [
    `Genera ${values.cantidad} títulos SEO sobre: ${values.tema}.`,
    `Palabra clave objetivo: ${values.palabraClave}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}
