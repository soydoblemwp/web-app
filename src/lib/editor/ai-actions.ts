/**
 * Every action the editor's floating AI menu offers. Follows the exact same
 * split AI Center tools use (src/lib/ai-center/tools/*.ts): a pure
 * buildSystemPrompt/buildUserPrompt pair per action, fed into the shared
 * useLocalAI().generate() — never a bespoke call into the AI engine, and
 * never a new engine. See src/components/editor/editor-ai-menu.tsx for the
 * caller.
 */
export interface EditorAiActionContext {
  /** Composed brand-context text (legacy BrandKit + BrandProfile), same shape every AI Center tool receives. */
  brandContext: string;
}

export interface EditorAiAction {
  id: string;
  label: string;
  /** Whether this action needs selected text to act on (all except "continue-writing"). */
  requiresSelection: boolean;
  buildSystemPrompt: (ctx: EditorAiActionContext) => string;
  buildUserPrompt: (selectedText: string) => string;
}

function baseSystem(instruction: string, ctx: EditorAiActionContext): string {
  const brand = ctx.brandContext.trim();
  return [
    "Eres un asistente de escritura integrado en un editor de contenido.",
    instruction,
    "Responde ÚNICAMENTE con el texto resultante, sin explicaciones, sin comillas, sin prefijos como \"Aquí tienes:\".",
    "Conserva el idioma original del texto salvo que se te pida traducirlo.",
    brand ? `Contexto de marca a respetar:\n${brand}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const TRANSLATE_LANGUAGES = [
  { id: "translate-en", label: "Inglés", target: "inglés" },
  { id: "translate-es", label: "Español", target: "español" },
  { id: "translate-fr", label: "Francés", target: "francés" },
  { id: "translate-pt", label: "Portugués", target: "portugués" },
  { id: "translate-de", label: "Alemán", target: "alemán" },
] as const;

export const EDITOR_AI_ACTIONS: EditorAiAction[] = [
  {
    id: "improve",
    label: "Mejorar escritura",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Mejora la claridad, fluidez y estilo del texto sin cambiar su significado.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "fix-grammar",
    label: "Corregir gramática",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Corrige exclusivamente la ortografía, gramática y puntuación del texto, sin reescribirlo de más.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "tone-professional",
    label: "Más profesional",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Reescribe el texto con un tono más profesional y formal.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "tone-friendly",
    label: "Más amigable",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Reescribe el texto con un tono más cercano, amigable y cálido.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "shorten",
    label: "Más corto",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Reduce el texto conservando la idea principal. Sé notablemente más breve.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "lengthen",
    label: "Más largo",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Amplía el texto con más detalle y desarrollo, manteniendo coherencia con el original.", ctx),
    buildUserPrompt: (text) => text,
  },
  ...TRANSLATE_LANGUAGES.map(
    (lang): EditorAiAction => ({
      id: lang.id,
      label: `Traducir al ${lang.label.toLowerCase()}`,
      requiresSelection: true,
      buildSystemPrompt: (ctx) => baseSystem(`Traduce el texto al ${lang.target}, conservando el formato y el sentido.`, ctx),
      buildUserPrompt: (text) => text,
    })
  ),
  {
    id: "seo",
    label: "SEO",
    requiresSelection: true,
    buildSystemPrompt: (ctx) =>
      baseSystem("Reescribe el texto optimizándolo para SEO: incluye lenguaje natural rico en palabras clave relevantes al tema, sin relleno ni keyword stuffing.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "cta",
    label: "CTA",
    requiresSelection: true,
    buildSystemPrompt: (ctx) =>
      baseSystem("A partir del texto, escribe una llamada a la acción (CTA) breve, persuasiva y coherente con el contenido.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "hashtags",
    label: "Hashtags",
    requiresSelection: true,
    buildSystemPrompt: (ctx) =>
      baseSystem("A partir del texto, genera entre 5 y 10 hashtags relevantes en una sola línea, separados por espacios, cada uno empezando con #.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "expand",
    label: "Expandir",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Expande el texto añadiendo ejemplos, matices o detalles adicionales relevantes.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "summarize",
    label: "Resumir",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Resume el texto en pocas frases, conservando únicamente las ideas esenciales.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "rewrite",
    label: "Reescribir",
    requiresSelection: true,
    buildSystemPrompt: (ctx) => baseSystem("Reescribe el texto por completo, con otras palabras, conservando su significado.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "remove-filler",
    label: "Eliminar relleno",
    requiresSelection: true,
    buildSystemPrompt: (ctx) =>
      baseSystem("Elimina muletillas, redundancias y relleno innecesario del texto, dejando solo lo esencial, sin perder el significado.", ctx),
    buildUserPrompt: (text) => text,
  },
  {
    id: "continue-writing",
    label: "Continuar escribiendo",
    requiresSelection: false,
    buildSystemPrompt: (ctx) => baseSystem("Continúa escribiendo a partir del texto proporcionado, con el mismo estilo y tono, de forma coherente.", ctx),
    buildUserPrompt: (text) => text,
  },
];

export function findEditorAiAction(id: string): EditorAiAction | undefined {
  return EDITOR_AI_ACTIONS.find((action) => action.id === id);
}
