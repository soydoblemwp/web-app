/**
 * Deterministic, rule-based SEO analysis. No AI involved and no external
 * data sources (search volume, CPC, difficulty) are used or fabricated —
 * every check here is fully documented and reproducible from the input text.
 */

export type SeoCheckStatus = "pass" | "warning" | "fail";

export interface SeoCheck {
  id: string;
  label: string;
  status: SeoCheckStatus;
  message: string;
  points: number;
  maxPoints: number;
}

export interface SeoAnalysisInput {
  title: string;
  metaDescription: string;
  targetKeyword: string;
  contentText: string;
}

export interface SeoAnalysisResult {
  score: number;
  checks: SeoCheck[];
}

const STOPWORDS = new Set([
  "el", "la", "los", "las", "de", "del", "y", "a", "en", "que", "un", "una",
  "para", "con", "por", "su", "sus", "es", "se", "lo", "al", "como", "más",
  "the", "a", "an", "of", "and", "to", "in", "for", "on", "with", "is", "are",
]);

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countOccurrences(text: string, term: string): number {
  if (!term.trim()) return 0;
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.match(new RegExp(escaped, "gi"));
  return matches?.length ?? 0;
}

function detectHeadings(text: string) {
  const lines = text.split("\n");
  const h1 = lines.filter((l) => /^#\s+/.test(l.trim())).length;
  const h2 = lines.filter((l) => /^##\s+/.test(l.trim())).length;
  const h3 = lines.filter((l) => /^###\s+/.test(l.trim())).length;
  return { h1, h2, h3 };
}

function averageWordsPerSentence(text: string): number {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + countWords(s), 0);
  return totalWords / sentences.length;
}

function mostRepeatedWord(text: string): { word: string; count: number } | null {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  let top: { word: string; count: number } | null = null;
  for (const [word, count] of counts) {
    if (!top || count > top.count) top = { word, count };
  }
  return top;
}

function check(id: string, label: string, status: SeoCheckStatus, message: string, points: number, maxPoints: number): SeoCheck {
  return { id, label, status, message, points, maxPoints };
}

export function analyzeSeo(input: SeoAnalysisInput): SeoAnalysisResult {
  const checks: SeoCheck[] = [];
  const title = input.title.trim();
  const meta = input.metaDescription.trim();
  const keyword = input.targetKeyword.trim();
  const body = input.contentText;

  // Title length: 50-60 characters is the commonly cited safe range for search result snippets.
  const titleLen = title.length;
  if (titleLen === 0) {
    checks.push(check("title-length", "Longitud del título", "fail", "No se ha indicado un título.", 0, 15));
  } else if (titleLen >= 40 && titleLen <= 60) {
    checks.push(check("title-length", "Longitud del título", "pass", `${titleLen} caracteres (rango recomendado: 40-60).`, 15, 15));
  } else {
    checks.push(check("title-length", "Longitud del título", "warning", `${titleLen} caracteres. Se recomienda entre 40 y 60.`, 7, 15));
  }

  // Title contains the target keyword.
  if (keyword && titleLen > 0) {
    const hasKeyword = countOccurrences(title, keyword) > 0;
    checks.push(
      hasKeyword
        ? check("title-keyword", "Palabra clave en el título", "pass", "La palabra clave aparece en el título.", 15, 15)
        : check("title-keyword", "Palabra clave en el título", "warning", "La palabra clave no aparece en el título.", 0, 15)
    );
  }

  // Meta description length: 120-160 characters is the range Google typically renders without truncation.
  const metaLen = meta.length;
  if (metaLen === 0) {
    checks.push(check("meta-length", "Longitud de la metadescripción", "fail", "No se ha indicado una metadescripción.", 0, 15));
  } else if (metaLen >= 120 && metaLen <= 160) {
    checks.push(check("meta-length", "Longitud de la metadescripción", "pass", `${metaLen} caracteres (rango recomendado: 120-160).`, 15, 15));
  } else {
    checks.push(check("meta-length", "Longitud de la metadescripción", "warning", `${metaLen} caracteres. Se recomienda entre 120 y 160.`, 7, 15));
  }

  if (keyword && metaLen > 0) {
    const hasKeyword = countOccurrences(meta, keyword) > 0;
    checks.push(
      hasKeyword
        ? check("meta-keyword", "Palabra clave en la metadescripción", "pass", "La palabra clave aparece en la metadescripción.", 10, 10)
        : check("meta-keyword", "Palabra clave en la metadescripción", "warning", "La palabra clave no aparece en la metadescripción.", 0, 10)
    );
  }

  // Heading structure: exactly one H1, at least one H2 (lines starting with #, ##, ### are treated as headings).
  const headings = detectHeadings(body);
  if (headings.h1 === 1) {
    checks.push(check("h1", "Un único H1", "pass", "El contenido tiene exactamente un H1.", 10, 10));
  } else if (headings.h1 === 0) {
    checks.push(check("h1", "Un único H1", "warning", "No se ha detectado ningún H1 (línea que empiece por \"# \").", 3, 10));
  } else {
    checks.push(check("h1", "Un único H1", "warning", `Se han detectado ${headings.h1} H1. Se recomienda usar solo uno.`, 3, 10));
  }
  checks.push(
    headings.h2 > 0
      ? check("h2", "Uso de H2", "pass", `${headings.h2} encabezados H2 detectados.`, 10, 10)
      : check("h2", "Uso de H2", "warning", "No se han detectado encabezados H2 (\"## \").", 3, 10)
  );

  // Word count: 300+ words is a common minimum for substantive articles/blog posts.
  const wordCount = countWords(body);
  if (wordCount >= 300) {
    checks.push(check("length", "Longitud del contenido", "pass", `${wordCount} palabras.`, 10, 10));
  } else if (wordCount >= 150) {
    checks.push(check("length", "Longitud del contenido", "warning", `${wordCount} palabras. Se recomiendan al menos 300 para artículos.`, 5, 10));
  } else {
    checks.push(check("length", "Longitud del contenido", "fail", `${wordCount} palabras. Contenido muy breve.`, 0, 10));
  }

  // Keyword density: 0.5%-2.5% is a commonly cited range that avoids both absence and keyword stuffing.
  if (keyword && wordCount > 0) {
    const occurrences = countOccurrences(body, keyword);
    const density = (occurrences / wordCount) * 100;
    if (density >= 0.5 && density <= 2.5) {
      checks.push(check("density", "Densidad de la palabra clave", "pass", `${density.toFixed(1)}% (${occurrences} apariciones).`, 10, 10));
    } else if (density === 0) {
      checks.push(check("density", "Densidad de la palabra clave", "fail", "La palabra clave no aparece en el contenido.", 0, 10));
    } else if (density > 2.5) {
      checks.push(check("density", "Densidad de la palabra clave", "warning", `${density.toFixed(1)}%. Posible sobreoptimización (keyword stuffing).`, 4, 10));
    } else {
      checks.push(check("density", "Densidad de la palabra clave", "warning", `${density.toFixed(1)}%. Se recomienda entre 0.5% y 2.5%.`, 5, 10));
    }
  }

  // Readability heuristic: shorter average sentence length reads as clearer.
  const avgWords = averageWordsPerSentence(body);
  if (avgWords > 0 && avgWords <= 20) {
    checks.push(check("readability", "Claridad (longitud media de frase)", "pass", `${avgWords.toFixed(1)} palabras por frase de media.`, 10, 10));
  } else if (avgWords > 20) {
    checks.push(check("readability", "Claridad (longitud media de frase)", "warning", `${avgWords.toFixed(1)} palabras por frase de media. Frases más cortas mejoran la lectura.`, 4, 10));
  }

  // Repeated-word check: flags a single non-stopword used disproportionately often.
  const repeated = mostRepeatedWord(body);
  if (repeated && wordCount > 0) {
    const ratio = repeated.count / wordCount;
    if (ratio > 0.06 && repeated.count > 5) {
      checks.push(check("repetition", "Palabras repetidas", "warning", `"${repeated.word}" aparece ${repeated.count} veces (${(ratio * 100).toFixed(1)}% del texto).`, 3, 5));
    } else {
      checks.push(check("repetition", "Palabras repetidas", "pass", "No se detectan repeticiones excesivas.", 5, 5));
    }
  }

  const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
  const maxPoints = checks.reduce((sum, c) => sum + c.maxPoints, 0);
  const score = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  return { score, checks };
}
