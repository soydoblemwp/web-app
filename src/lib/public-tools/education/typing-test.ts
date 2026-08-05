/**
 * Original, locally-bundled sample texts (never scraped/copied from a
 * protected source) and pure WPM/accuracy math for the typing-speed test.
 * WPM here is defined and shown to the visitor exactly as computed: correct
 * characters ÷ 5 ÷ minutes elapsed (the standard "characters per word"
 * convention), never left unexplained (spec section 19).
 */
export type TypingLanguage = "es" | "en";
export type TypingDifficulty = "easy" | "medium" | "hard";

const TEXTS_ES: Record<TypingDifficulty, string[]> = {
  easy: [
    "El sol brilla sobre el campo verde. Los pájaros cantan cada mañana. Un perro corre feliz por el jardín.",
    "Me gusta leer libros por la tarde. El café caliente ayuda a empezar bien el día. La lluvia cae suave sobre el techo.",
  ],
  medium: [
    "La tecnología avanza rápidamente y cambia la forma en que trabajamos, aprendemos y nos comunicamos entre nosotros cada día.",
    "Un buen hábito de lectura mejora la concentración, amplía el vocabulario y ofrece nuevas perspectivas sobre el mundo que nos rodea.",
  ],
  hard: [
    "La programación requiere paréntesis, corchetes y llaves; además, símbolos como {}, [], (), #, %, & y @ aparecen constantemente en el código.",
    "¿Sabías que la ortografía en español incluye tildes, diéresis (ü) y la letra ñ? ¡La precisión al escribir es fundamental!",
  ],
};

const TEXTS_EN: Record<TypingDifficulty, string[]> = {
  easy: [
    "The sun shines over the green field. Birds sing every morning. A happy dog runs through the yard.",
    "I like reading books in the afternoon. Hot coffee helps start the day well. Rain falls softly on the roof.",
  ],
  medium: [
    "Technology advances quickly and changes the way we work, learn, and communicate with each other every day.",
    "A good reading habit improves focus, expands vocabulary, and offers new perspectives on the world around us.",
  ],
  hard: [
    "Programming requires parentheses, brackets, and braces; symbols like {}, [], (), #, %, & and @ constantly appear in code.",
    "Did you know punctuation includes semicolons; colons: and em-dashes—used correctly, they sharpen your writing!",
  ],
};

export function getSampleText(language: TypingLanguage, difficulty: TypingDifficulty, index = 0): string {
  const bank = language === "es" ? TEXTS_ES : TEXTS_EN;
  const list = bank[difficulty];
  return list[index % list.length];
}

export function countSampleTexts(language: TypingLanguage, difficulty: TypingDifficulty): number {
  return (language === "es" ? TEXTS_ES : TEXTS_EN)[difficulty].length;
}

export interface TypingResult {
  wpm: number;
  cpm: number;
  accuracyPercent: number;
  correctChars: number;
  incorrectChars: number;
  correctWords: number;
  incorrectWords: number;
  consistencyPercent: number;
  elapsedSeconds: number;
}

/**
 * `typed` is compared character-by-character against `target`. WPM =
 * (correct characters / 5) / minutes elapsed — the standard convention,
 * always shown alongside the result so the visitor knows exactly how it
 * was computed (spec section 19: "debe explicarse en la interfaz").
 */
export function computeTypingResult(target: string, typed: string, elapsedSeconds: number, wpmSamples?: number[]): TypingResult {
  const length = Math.min(target.length, typed.length);
  let correctChars = 0;
  let incorrectChars = 0;
  for (let i = 0; i < length; i++) {
    if (typed[i] === target[i]) correctChars++;
    else incorrectChars++;
  }
  incorrectChars += Math.max(0, typed.length - target.length);

  const targetWords = target.trim().split(/\s+/);
  const typedWords = typed.trim().split(/\s+/);
  let correctWords = 0;
  let incorrectWords = 0;
  for (let i = 0; i < typedWords.length; i++) {
    if (typedWords[i] === targetWords[i]) correctWords++;
    else incorrectWords++;
  }

  const minutes = Math.max(elapsedSeconds / 60, 1 / 3600); // avoid divide-by-zero for a near-instant sample
  const wpm = Math.round(correctChars / 5 / minutes);
  const cpm = Math.round(correctChars / minutes);
  const totalTyped = correctChars + incorrectChars;
  const accuracyPercent = totalTyped > 0 ? Math.round((correctChars / totalTyped) * 1000) / 10 : 100;

  let consistencyPercent = 100;
  if (wpmSamples && wpmSamples.length > 1) {
    const mean = wpmSamples.reduce((a, b) => a + b, 0) / wpmSamples.length;
    const variance = wpmSamples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / wpmSamples.length;
    const stdDev = Math.sqrt(variance);
    consistencyPercent = mean > 0 ? Math.max(0, Math.round((1 - stdDev / mean) * 1000) / 10) : 100;
  }

  return { wpm, cpm, accuracyPercent, correctChars, incorrectChars, correctWords, incorrectWords, consistencyPercent, elapsedSeconds };
}
