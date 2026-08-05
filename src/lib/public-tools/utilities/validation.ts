export interface NumericInputResult {
  ok: boolean;
  value?: number;
  error?: string;
}

/**
 * Shared numeric parsing for the percentage/unit/age tools (spec section
 * 7: "no copies validación numérica... en cada componente"). Accepts a
 * comma as a decimal separator (common in Spanish-language input) in
 * addition to a dot, and rejects empty input, NaN, and Infinity with the
 * same wording everywhere.
 */
export function parseNumericInput(raw: string, label = "El valor"): NumericInputResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: `${label} no puede estar vacío.` };

  // Only treat "," as a decimal separator when the input has no "." at all — avoids misreading
  // an ordinary English-style decimal like "1.234" as if it were a thousands-grouped integer.
  const normalized = trimmed.includes(".") ? trimmed : trimmed.replace(",", ".");
  const value = Number(normalized);

  if (Number.isNaN(value)) return { ok: false, error: `${label} no es un número válido.` };
  if (!Number.isFinite(value)) return { ok: false, error: `${label} no puede ser infinito.` };
  return { ok: true, value };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
