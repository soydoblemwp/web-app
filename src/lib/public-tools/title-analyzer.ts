import { isSpanishStopword } from "./stopwords-es";

export interface TitleAnalysis {
  length: number;
  wordCount: number;
  hasNumber: boolean;
  hasQuestionOrExclamation: boolean;
  hasBrackets: boolean;
  repeatedWords: string[];
  keywordPresent: boolean | null;
  lengthWarning: string | null;
  suggestions: string[];
}

const RECOMMENDED_MIN = 40;
const RECOMMENDED_MAX = 60;

/**
 * Rule-based only — no AI, no scoring model. Every signal here is a plain,
 * explainable heuristic (length, repetition, punctuation, keyword presence),
 * never a synthesized "SEO score" out of 100 (spec section 20E explicitly
 * forbids inventing absolute SEO scores).
 */
export function analyzeTitle(rawTitle: string, keyword?: string): TitleAnalysis {
  const title = rawTitle.trim();
  const length = title.length;
  const words = title.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  const wordCount = words.length;

  const hasNumber = /\d/.test(title);
  const hasQuestionOrExclamation = /[?¿!¡]/.test(title);
  const hasBrackets = /[[\]()]/.test(title);

  const normalized = words.map((w) => w.toLowerCase()).filter((w) => w.length > 2 && !isSpanishStopword(w));
  const seen = new Map<string, number>();
  for (const word of normalized) seen.set(word, (seen.get(word) ?? 0) + 1);
  const repeatedWords = Array.from(seen.entries())
    .filter(([, count]) => count > 1)
    .map(([word]) => word);

  const keywordPresent = keyword?.trim() ? title.toLowerCase().includes(keyword.trim().toLowerCase()) : null;

  let lengthWarning: string | null = null;
  if (length === 0) {
    lengthWarning = null;
  } else if (length < RECOMMENDED_MIN) {
    lengthWarning = `El título tiene ${length} caracteres, por debajo del rango orientativo de ${RECOMMENDED_MIN}-${RECOMMENDED_MAX}. Puede aparecer completo en buscadores, pero podría aportar más contexto.`;
  } else if (length > RECOMMENDED_MAX) {
    lengthWarning = `El título tiene ${length} caracteres, por encima del rango orientativo de ${RECOMMENDED_MIN}-${RECOMMENDED_MAX}. Es posible que se recorte en algunos resultados de búsqueda.`;
  } else {
    lengthWarning = `El título tiene ${length} caracteres, dentro del rango orientativo de ${RECOMMENDED_MIN}-${RECOMMENDED_MAX}.`;
  }

  const suggestions: string[] = [];
  if (repeatedWords.length > 0) suggestions.push(`Repite la palabra "${repeatedWords[0]}"; considera variarla o eliminar una repetición.`);
  if (keywordPresent === false) suggestions.push("La palabra clave indicada no aparece en el título; inclúyela si es relevante.");
  if (!hasNumber && !hasQuestionOrExclamation) suggestions.push("Añadir un número o una pregunta puede hacer el título más concreto (orientativo, no obligatorio).");
  if (wordCount > 0 && wordCount < 4) suggestions.push("El título es muy corto en número de palabras; puede beneficiarse de más contexto.");

  return {
    length,
    wordCount,
    hasNumber,
    hasQuestionOrExclamation,
    hasBrackets,
    repeatedWords,
    keywordPresent,
    lengthWarning,
    suggestions,
  };
}
