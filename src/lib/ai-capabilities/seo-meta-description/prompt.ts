/**
 * The single "generate meta descriptions" capability, shared by AI Center's
 * Blog & SEO meta-description generator (re-exported under its original
 * `buildMetaDescriptionSystemPrompt`/`buildMetaDescriptionPrompt` names) and
 * the public `/herramientas/generador-titulos-meta-descripciones` tool.
 */
export function buildSeoMetaDescriptionSystemPrompt(context: string): string {
  return [
    "Eres el generador de meta descripciones de AI Content Hub.",
    "Cada meta descripción debe tener entre 140 y 160 caracteres, incluir la palabra clave objetivo de forma natural y terminar con un motivo claro para hacer clic.",
    "No inventes ofertas, cifras ni datos que no se puedan verificar.",
    "Devuelve únicamente una lista numerada de opciones de meta descripción, una por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export interface SeoMetaDescriptionValues {
  tema: string;
  palabraClave: string;
  idioma: string;
  cantidad: string;
}

export function buildSeoMetaDescriptionPrompt(values: SeoMetaDescriptionValues): string {
  return [
    `Genera ${values.cantidad} meta descripciones para una página sobre: ${values.tema}.`,
    `Palabra clave objetivo: ${values.palabraClave}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}
