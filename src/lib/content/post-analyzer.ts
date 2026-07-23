/**
 * Deterministic, rule-based analysis for a single social media post draft.
 * No AI, no network, no persistence — mirrors the SEO analyzer's approach
 * (src/lib/seo/analyzer.ts) applied to short-form social copy instead of
 * long-form content. Safe to import from client components.
 */

export type PostCheckStatus = "pass" | "warning" | "fail";

export interface PostCheck {
  id: string;
  label: string;
  status: PostCheckStatus;
  message: string;
}

export interface PostAnalysisInput {
  text: string;
  platform: string;
}

export interface PostAnalysisResult {
  score: number;
  checks: PostCheck[];
}

// Widely-cited "sweet spot" ranges per platform for caption length before
// truncation or reader drop-off. Used only for the length check below.
const PLATFORM_LENGTH_RANGES: Record<string, { min: number; max: number }> = {
  INSTAGRAM: { min: 50, max: 300 },
  FACEBOOK: { min: 40, max: 250 },
  TIKTOK: { min: 20, max: 150 },
  X: { min: 20, max: 280 },
  LINKEDIN: { min: 100, max: 600 },
  PINTEREST: { min: 40, max: 200 },
  YOUTUBE: { min: 50, max: 400 },
  DEFAULT: { min: 40, max: 300 },
};

const CTA_PATTERNS = [
  /haz clic/i,
  /descubre/i,
  /comenta/i,
  /comparte/i,
  /guarda este/i,
  /sígueme/i,
  /link en (la )?bio/i,
  /más información/i,
  /compra/i,
  /reserva/i,
  /descarga/i,
  /regístrate/i,
  /suscr[ií]bete/i,
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function check(id: string, label: string, status: PostCheckStatus, message: string): PostCheck {
  return { id, label, status, message };
}

export function analyzePost(input: PostAnalysisInput): PostAnalysisResult {
  const checks: PostCheck[] = [];
  const text = input.text.trim();
  const range = PLATFORM_LENGTH_RANGES[input.platform] ?? PLATFORM_LENGTH_RANGES.DEFAULT;

  if (text.length === 0) {
    return {
      score: 0,
      checks: [check("empty", "Contenido", "fail", "No se ha introducido ningún texto.")],
    };
  }

  // Length for the selected platform.
  if (text.length >= range.min && text.length <= range.max) {
    checks.push(
      check("length", "Longitud para la plataforma", "pass", `${text.length} caracteres (rango recomendado: ${range.min}-${range.max}).`)
    );
  } else if (text.length > range.max) {
    checks.push(
      check("length", "Longitud para la plataforma", "warning", `${text.length} caracteres. Supera el rango recomendado de ${range.max} para esta plataforma.`)
    );
  } else {
    checks.push(
      check("length", "Longitud para la plataforma", "warning", `${text.length} caracteres. Por debajo del mínimo recomendado de ${range.min}.`)
    );
  }

  // Hook: first line should be short and not start mid-sentence.
  const firstLine = text.split("\n")[0] ?? "";
  if (firstLine.length > 0 && firstLine.length <= 100) {
    checks.push(check("hook", "Gancho inicial", "pass", "La primera línea es corta y capta la atención rápido."));
  } else if (firstLine.length > 100) {
    checks.push(check("hook", "Gancho inicial", "warning", "La primera línea es larga; considera acortarla para captar la atención antes del \"ver más\"."));
  }

  // Hashtag count: a commonly cited range that avoids both under- and over-tagging.
  const hashtags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (hashtags.length === 0) {
    checks.push(check("hashtags", "Hashtags", "warning", "No se han detectado hashtags."));
  } else if (hashtags.length > 15) {
    checks.push(check("hashtags", "Hashtags", "warning", `${hashtags.length} hashtags. Un número muy alto puede parecer spam.`));
  } else {
    checks.push(check("hashtags", "Hashtags", "pass", `${hashtags.length} hashtags detectados.`));
  }

  // CTA presence via a fixed keyword list — deterministic, not an AI guess.
  const hasCTA = CTA_PATTERNS.some((pattern) => pattern.test(text));
  checks.push(
    hasCTA
      ? check("cta", "Llamado a la acción", "pass", "Se detecta una posible llamada a la acción.")
      : check("cta", "Llamado a la acción", "warning", "No se detecta una llamada a la acción clara (ej. \"comenta\", \"guarda\", \"link en bio\").")
  );

  // Repetition: same non-trivial word used excessively.
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const wordCount = countWords(text);
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  let mostRepeated: { word: string; count: number } | null = null;
  for (const [word, count] of counts) {
    if (!mostRepeated || count > mostRepeated.count) mostRepeated = { word, count };
  }
  if (mostRepeated && wordCount > 0 && mostRepeated.count / wordCount > 0.15 && mostRepeated.count > 3) {
    checks.push(check("repetition", "Repetición de palabras", "warning", `"${mostRepeated.word}" se repite ${mostRepeated.count} veces.`));
  } else {
    checks.push(check("repetition", "Repetición de palabras", "pass", "No se detectan repeticiones excesivas."));
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const score = Math.round((passCount / checks.length) * 100);

  return { score, checks };
}
