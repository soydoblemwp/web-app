/** Centralized limits for the text/file comparator — the LCS-based diff algorithms below are O(n·m) in the worst case, so both dimensions must be bounded (spec section 21: "define límites para caracteres, líneas, memoria, tiempo"). */
export const COMPARISON_LIMITS = {
  maxCharsPerText: 200_000,
  maxLinesPerText: 20_000,
  /** Above this many lines, line-level diffing runs in a Worker so the main thread never blocks. */
  workerThresholdLines: 2000,
  maxFileBytes: 5 * 1024 * 1024,
};
