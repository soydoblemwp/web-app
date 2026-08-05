import { isSpanishStopword } from "./stopwords-es";

export interface WordFrequencyEntry {
  word: string;
  count: number;
}

export interface TextAnalysis {
  words: number;
  charactersWithSpaces: number;
  charactersWithoutSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingTimeMinutes: number;
  speakingTimeMinutes: number;
  uniqueWords: number;
  averageWordLength: number;
  averageSentenceLength: number;
  topWords: WordFrequencyEntry[];
}

const SILENT_READING_WPM = 200;
const SPEAKING_WPM = 130;

function tokenizeWords(text: string): string[] {
  const matches = text.match(/[\p{L}\p{N}'’-]+/gu);
  return matches ?? [];
}

export function analyzeText(rawText: string): TextAnalysis {
  const text = rawText;
  const trimmed = text.trim();

  const words = trimmed ? tokenizeWords(trimmed) : [];
  const wordCount = words.length;

  const charactersWithSpaces = text.length;
  const charactersWithoutSpaces = text.replace(/\s/g, "").length;

  const sentenceMatches = trimmed.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g);
  const sentences = trimmed ? (sentenceMatches?.filter((s) => s.trim().length > 0).length ?? (trimmed ? 1 : 0)) : 0;

  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length : 0;
  const lines = text ? text.split("\n").length : 0;

  const readingTimeMinutes = wordCount / SILENT_READING_WPM;
  const speakingTimeMinutes = wordCount / SPEAKING_WPM;

  const normalizedWords = words.map((w) => w.toLowerCase());
  const uniqueWords = new Set(normalizedWords).size;

  const totalWordChars = words.reduce((sum, w) => sum + w.length, 0);
  const averageWordLength = wordCount > 0 ? totalWordChars / wordCount : 0;
  const averageSentenceLength = sentences > 0 ? wordCount / sentences : 0;

  const frequency = new Map<string, number>();
  for (const word of normalizedWords) {
    if (word.length < 3 || isSpanishStopword(word) || /^\d+$/.test(word)) continue;
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }
  const topWords = Array.from(frequency.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 10);

  return {
    words: wordCount,
    charactersWithSpaces,
    charactersWithoutSpaces,
    sentences,
    paragraphs,
    lines,
    readingTimeMinutes,
    speakingTimeMinutes,
    uniqueWords,
    averageWordLength,
    averageSentenceLength,
    topWords,
  };
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1 / 60) return "menos de 1 seg";
  const totalSeconds = Math.round(minutes * 60);
  if (totalSeconds < 60) return `${totalSeconds} seg`;
  const wholeMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${wholeMinutes} min ${seconds} seg` : `${wholeMinutes} min`;
}

export function analysisToTextReport(analysis: TextAnalysis): string {
  const lines = [
    `Palabras: ${analysis.words}`,
    `Caracteres con espacios: ${analysis.charactersWithSpaces}`,
    `Caracteres sin espacios: ${analysis.charactersWithoutSpaces}`,
    `Oraciones: ${analysis.sentences}`,
    `Párrafos: ${analysis.paragraphs}`,
    `Líneas: ${analysis.lines}`,
    `Tiempo de lectura: ${formatMinutes(analysis.readingTimeMinutes)}`,
    `Tiempo de lectura en voz alta: ${formatMinutes(analysis.speakingTimeMinutes)}`,
    `Palabras únicas: ${analysis.uniqueWords}`,
    `Longitud media de palabra: ${analysis.averageWordLength.toFixed(1)} caracteres`,
    `Longitud media de oración: ${analysis.averageSentenceLength.toFixed(1)} palabras`,
    "",
    "Palabras más frecuentes:",
    ...analysis.topWords.map((w) => `- ${w.word}: ${w.count}`),
  ];
  return lines.join("\n");
}
