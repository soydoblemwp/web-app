export interface DeterministicChange {
  category: "espacios" | "puntuacion" | "mayusculas" | "saltos";
  description: string;
}

export interface DeterministicCorrectionResult {
  correctedText: string;
  changes: DeterministicChange[];
}

/**
 * Always-on, rule-based corrections that never require AI: repeated spaces,
 * duplicated punctuation, missing capitalization after sentence-ending
 * punctuation, and excessive blank lines. Runs first and independently of
 * the optional local-AI advanced pass (spec section 12: "Añade validaciones
 * deterministas básicas").
 */
export function applyDeterministicCorrections(rawText: string): DeterministicCorrectionResult {
  let text = rawText;
  const changes: DeterministicChange[] = [];

  const collapsedSpaces = text.replace(/[^\S\n]{2,}/g, " ");
  if (collapsedSpaces !== text) {
    changes.push({ category: "espacios", description: "Se eliminaron espacios repetidos." });
    text = collapsedSpaces;
  }

  const collapsedPunctuation = text.replace(/([.,;:!?]){2,}/g, (match, char: string) => (char === "." ? "..." : char));
  if (collapsedPunctuation !== text) {
    changes.push({ category: "puntuacion", description: "Se corrigió puntuación duplicada." });
    text = collapsedPunctuation;
  }

  const capitalized = text.replace(/(^\s*[a-záéíóúñ]|[.!?]\s+[a-záéíóúñ])/g, (match) => match.toUpperCase());
  if (capitalized !== text) {
    changes.push({ category: "mayusculas", description: "Se puso en mayúscula el inicio de una o más oraciones." });
    text = capitalized;
  }

  const collapsedBreaks = text.replace(/\n{3,}/g, "\n\n");
  if (collapsedBreaks !== text) {
    changes.push({ category: "saltos", description: "Se redujeron saltos de línea excesivos." });
    text = collapsedBreaks;
  }

  return { correctedText: text, changes };
}
