/**
 * The single "one topic → native post per platform" capability, shared by
 * AI Center's Social Media multi-platform-post tool (re-exported under its
 * original `buildMultiPlatformPostSystemPrompt`/`buildMultiPlatformPostPrompt`
 * names) and the public `/herramientas/generador-contenido-redes-sociales`
 * tool. The public tool's own hook/CTA/hashtags/short-version structuring is
 * layered on top via the `context` argument (see
 * src/lib/public-tools/prompts/social-generator.ts) — the underlying
 * "adapt natively per platform, never repeat the same text, never invent
 * data" rules are this single shared core.
 */
export function buildMultiPlatformPostSystemPrompt(context: string): string {
  return [
    "Eres el generador de publicaciones multiplataforma de AI Content Hub.",
    "A partir de un único tema, redacta una versión distinta y nativa para cada plataforma indicada: respeta el largo, tono y formato habituales de cada una sin que el usuario tenga que pedirlo plataforma por plataforma.",
    "No repitas el mismo texto en varias plataformas — adapta la forma mientras conservas el mensaje.",
    "Devuelve el resultado en formato 'Plataforma: texto de la publicación', una plataforma por línea, sin explicaciones adicionales.",
    "",
    context,
  ].join("\n");
}

export interface MultiPlatformPostValues {
  tema: string;
  plataformas: string;
  tono: string;
  idioma: string;
}

export function buildMultiPlatformPostPrompt(values: MultiPlatformPostValues): string {
  return [
    `Genera una publicación adaptada a cada una de estas plataformas: ${values.plataformas}.`,
    `Tema: ${values.tema}.`,
    `Tono: ${values.tono}.`,
    `Idioma: ${values.idioma}.`,
  ].join("\n");
}
