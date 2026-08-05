/** Average adult silent-reading speed used across the editor's stats bar. */
const WORDS_PER_MINUTE = 200;

/** Rounds up so "30 seconds of reading" still shows as "1 min", never "0 min". */
export function estimateReadingTimeMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}
