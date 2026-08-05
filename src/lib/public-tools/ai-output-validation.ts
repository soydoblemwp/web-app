/**
 * Shared, honest validation for every local-AI text tool in the public
 * center. Never invents a "confidence score" — just concrete, checkable
 * failure modes so a tool never silently shows a broken or off-spec result.
 */
export interface AiOutputValidationOptions {
  /** Numeric sequences (years, prices, percentages...) extracted from the input, expected to still be present in the output. */
  preserveNumbers?: boolean;
  sourceText?: string;
}

export interface AiOutputValidationResult {
  ok: boolean;
  warning?: string;
}

const INSTRUCTION_LEAK_PATTERNS = [
  /as an ai language model/i,
  /i cannot fulfill/i,
  /system prompt/i,
  /\bhere is the rewritten text\b/i,
  /^\s*(sure|okay|claro),?\s*(aquí|here)/i,
];

function extractNumberTokens(text: string): string[] {
  return text.match(/\d[\d.,]*%?/g) ?? [];
}

/** Very rough Spanish-vs-other-language heuristic: counts common Spanish function words per 100 words. Not a language detector — just enough to catch an accidental full language switch. */
function looksLikeSpanish(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (words.length < 8) return true;
  const markers = new Set(["que", "de", "la", "el", "y", "en", "los", "las", "un", "una", "es", "por", "para", "con", "no"]);
  const hits = words.filter((w) => markers.has(w)).length;
  return hits / words.length > 0.03;
}

export function validateAiTextOutput(output: string | null, options: AiOutputValidationOptions = {}): AiOutputValidationResult {
  if (!output || !output.trim()) {
    return { ok: false, warning: "La IA no devolvió ningún resultado. Intenta de nuevo." };
  }

  const trimmed = output.trim();

  for (const pattern of INSTRUCTION_LEAK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, warning: "El resultado parece incluir texto de instrucciones internas en vez de la respuesta esperada. Intenta de nuevo." };
    }
  }

  if (!looksLikeSpanish(trimmed)) {
    return { ok: false, warning: "El resultado parece estar en otro idioma distinto al esperado. Intenta de nuevo." };
  }

  if (options.preserveNumbers && options.sourceText) {
    const sourceNumbers = extractNumberTokens(options.sourceText);
    const outputNumbers = new Set(extractNumberTokens(trimmed));
    const missing = sourceNumbers.filter((n) => !outputNumbers.has(n));
    if (missing.length > 0) {
      return { ok: true, warning: `Aviso: el resultado podría no conservar estas cifras del texto original: ${missing.slice(0, 5).join(", ")}.` };
    }
  }

  return { ok: true };
}
