/**
 * Small, dependency-free line-level diff (no package installed — see the
 * Fase 27 spec: "no instales una librería pesada si puede resolverse con una
 * implementación simple y mantenible"). Line-level (paragraph-level once the
 * caller splits HTML into plain-text lines) rather than word-level on
 * purpose: an LCS diff is O(n*m) in the number of tokens being compared, and
 * a full article can run to thousands of words — splitting into lines first
 * keeps the token count (and therefore the DP table) small regardless of
 * document length, while still producing a meaningful "what changed"
 * article-review view.
 */
export interface DiffLine {
  type: "equal" | "added" | "removed";
  value: string;
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  return diffTokens(oldLines, newLines);
}

function diffTokens(oldTokens: string[], newTokens: string[]): DiffLine[] {
  const n = oldTokens.length;
  const m = newTokens.length;

  // lcsLength[i][j] = length of the LCS of oldTokens[i:] and newTokens[j:]
  const lcsLength: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcsLength[i][j] =
        oldTokens[i] === newTokens[j] ? lcsLength[i + 1][j + 1] + 1 : Math.max(lcsLength[i + 1][j], lcsLength[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTokens[i] === newTokens[j]) {
      result.push({ type: "equal", value: oldTokens[i] });
      i += 1;
      j += 1;
    } else if (lcsLength[i + 1][j] >= lcsLength[i][j + 1]) {
      result.push({ type: "removed", value: oldTokens[i] });
      i += 1;
    } else {
      result.push({ type: "added", value: newTokens[j] });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ type: "removed", value: oldTokens[i] });
    i += 1;
  }
  while (j < m) {
    result.push({ type: "added", value: newTokens[j] });
    j += 1;
  }

  return result;
}

export interface DiffSummary {
  addedLines: number;
  removedLines: number;
}

export function summarizeDiff(diff: DiffLine[]): DiffSummary {
  return {
    addedLines: diff.filter((line) => line.type === "added").length,
    removedLines: diff.filter((line) => line.type === "removed").length,
  };
}
