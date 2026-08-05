import { buildRepurposeSystemPrompt, buildRepurposePrompt } from "@/lib/ai-capabilities/repurpose/prompt";

/**
 * Fase 41 correction: this file no longer defines its own "adapt content to
 * another format" prompt — it composes the shared
 * `src/lib/ai-capabilities/repurpose/prompt.ts` core (the same one AI
 * Center's Social Media repurpose tool calls), passing the selected output
 * type as the destination `plataformas` description and folding this tool's
 * extra per-format instructions and the "never claim to publish" rule into
 * the `context` argument that core already accepts.
 */
export type RepurposeOutput =
  | "instagram-post"
  | "tiktok-script"
  | "youtube-description"
  | "linkedin-post"
  | "x-thread"
  | "email"
  | "summary"
  | "ideas-list"
  | "faq"
  | "article-outline";

export const REPURPOSE_OUTPUTS: { id: RepurposeOutput; label: string }[] = [
  { id: "instagram-post", label: "Publicación de Instagram" },
  { id: "tiktok-script", label: "Guion de TikTok" },
  { id: "youtube-description", label: "Descripción de YouTube" },
  { id: "linkedin-post", label: "Publicación de LinkedIn" },
  { id: "x-thread", label: "Hilo para X" },
  { id: "email", label: "Correo" },
  { id: "summary", label: "Resumen" },
  { id: "ideas-list", label: "Lista de ideas" },
  { id: "faq", label: "FAQ" },
  { id: "article-outline", label: "Esquema de artículo" },
];

const OUTPUT_FORMAT_DESCRIPTION: Record<RepurposeOutput, string> = {
  "instagram-post": "un pie de foto de Instagram cercano, con hashtags relevantes al final derivados del propio contenido",
  "tiktok-script": "un guion corto de TikTok con gancho inicial, cuerpo y cierre",
  "youtube-description": "una descripción de vídeo de YouTube con resumen inicial y contexto adicional",
  "linkedin-post": "una publicación de LinkedIn con tono profesional",
  "x-thread": "un hilo para X de 3 a 5 publicaciones numeradas, cada una dentro de 280 caracteres",
  email: "un correo breve con asunto y cuerpo",
  summary: "un resumen en un párrafo breve y fiel al original",
  "ideas-list": "una lista de ideas o subtemas que podrían desarrollarse por separado a partir del contenido",
  faq: "un FAQ de 4 a 6 preguntas y respuestas basadas estrictamente en el contenido proporcionado",
  "article-outline": "un esquema de artículo con títulos y subtítulos",
};

function buildExtraContext(): string {
  return "Nunca indiques que vas a publicar, programar o enviar el contenido — solo generas el texto.";
}

export function buildRepurposerSystemPrompt(): string {
  return buildRepurposeSystemPrompt(buildExtraContext());
}

export function buildRepurposerPrompt(sourceText: string, output: RepurposeOutput): string {
  return buildRepurposePrompt({ contenidoOriginal: sourceText, plataformas: OUTPUT_FORMAT_DESCRIPTION[output], idioma: "es" });
}
