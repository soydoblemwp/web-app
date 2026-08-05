/**
 * Minimal shape of Tiptap's editor.getJSON() output — only the fields this
 * analysis reads. Kept local (not imported from @tiptap/core) so this stays
 * a dependency-free pure function, easy to unit test with plain object
 * literals instead of a real editor instance.
 */
export interface EditorJsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: EditorJsonNode[];
  text?: string;
}

export interface HeadingEntry {
  level: number;
  text: string;
  /** Occurrence index among all headings, in document order — used to find the matching rendered <h1-3> in the live DOM for "click to scroll to". */
  index: number;
}

export interface StructureIssue {
  id: string;
  message: string;
}

export interface StructureAnalysis {
  headings: HeadingEntry[];
  sectionCount: number;
  emptyBlockCount: number;
  longParagraphCount: number;
  duplicateHeadings: string[];
  hasIntro: boolean;
  hasConclusion: boolean;
  hasCta: boolean;
  issues: StructureIssue[];
}

const LONG_PARAGRAPH_CHARS = 800;

const CTA_KEYWORDS = [
  "haz clic",
  "haga clic",
  "compra",
  "comprar",
  "suscríbete",
  "suscribete",
  "regístrate",
  "registrate",
  "descarga",
  "descárgalo",
  "contáctanos",
  "contactanos",
  "reserva",
  "solicita",
  "empieza ahora",
  "prueba gratis",
  "más información",
  "mas informacion",
  "llama ahora",
  "agenda",
  "inscríbete",
];

function extractText(node: EditorJsonNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}

function isBlankBlock(node: EditorJsonNode): boolean {
  if (node.type !== "paragraph" && node.type !== "heading") return false;
  return extractText(node).trim().length === 0;
}

/** Pure structural analysis of the editor's document — no AI involved (see src/lib/editor/ai-actions.ts for the AI-backed fix actions this feeds into). */
export function analyzeStructure(doc: EditorJsonNode): StructureAnalysis {
  const blocks = doc.content ?? [];
  const headings: HeadingEntry[] = [];
  const headingOccurrences = new Map<string, number>();
  let emptyBlockCount = 0;
  let longParagraphCount = 0;

  blocks.forEach((block) => {
    if (block.type === "heading") {
      const level = typeof block.attrs?.level === "number" ? block.attrs.level : 1;
      const text = extractText(block).trim();
      headings.push({ level, text, index: headings.length });
      if (text) headingOccurrences.set(text.toLowerCase(), (headingOccurrences.get(text.toLowerCase()) ?? 0) + 1);
      else emptyBlockCount += 1;
      return;
    }

    if (isBlankBlock(block)) {
      emptyBlockCount += 1;
      return;
    }

    if (block.type === "paragraph") {
      const text = extractText(block);
      if (text.length > LONG_PARAGRAPH_CHARS) longParagraphCount += 1;
    }
  });

  const duplicateHeadings = [...headingOccurrences.entries()].filter(([, count]) => count > 1).map(([text]) => text);

  const firstSubstantiveIndex = blocks.findIndex((block) => block.type === "paragraph" && extractText(block).trim().length > 0);
  const hasIntro = firstSubstantiveIndex !== -1 && firstSubstantiveIndex <= 1;

  const hasConclusion = blocks
    .slice(-2)
    .some((block) => block.type === "paragraph" && extractText(block).trim().length > 40);

  const fullText = extractText(doc).toLowerCase();
  const hasCta = CTA_KEYWORDS.some((keyword) => fullText.includes(keyword));

  const issues: StructureIssue[] = [];
  if (blocks.length === 0) issues.push({ id: "empty-document", message: "El documento está vacío." });
  if (emptyBlockCount > 0) issues.push({ id: "empty-blocks", message: `${emptyBlockCount} bloque(s) vacío(s).` });
  if (longParagraphCount > 0) issues.push({ id: "long-paragraphs", message: `${longParagraphCount} párrafo(s) demasiado largo(s).` });
  if (duplicateHeadings.length > 0)
    issues.push({ id: "duplicate-headings", message: `Encabezados duplicados: ${duplicateHeadings.join(", ")}.` });
  if (blocks.length > 0 && !hasIntro) issues.push({ id: "missing-intro", message: "Falta una introducción al inicio." });
  if (blocks.length > 0 && !hasConclusion) issues.push({ id: "missing-conclusion", message: "Falta una conclusión al final." });
  if (blocks.length > 0 && !hasCta) issues.push({ id: "missing-cta", message: "No se detectó una llamada a la acción (CTA)." });

  return {
    headings,
    sectionCount: headings.length,
    emptyBlockCount,
    longParagraphCount,
    duplicateHeadings,
    hasIntro,
    hasConclusion,
    hasCta,
    issues,
  };
}
