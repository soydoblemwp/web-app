export interface DiffToken {
  type: "equal" | "added" | "removed";
  text: string;
}

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Word-level LCS diff between two texts. Used to honestly show what an AI
 * correction pass actually changed — we never ask the AI to self-report its
 * own edits (which risks a hallucinated change list); instead the diff is
 * computed directly from the before/after text.
 */
export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ type: "equal", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      tokens.push({ type: "removed", text: a[i] });
      i++;
    } else {
      tokens.push({ type: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    tokens.push({ type: "removed", text: a[i] });
    i++;
  }
  while (j < m) {
    tokens.push({ type: "added", text: b[j] });
    j++;
  }

  return tokens;
}

export function countChanges(tokens: DiffToken[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const token of tokens) {
    if (token.type === "added" && token.text.trim()) added++;
    if (token.type === "removed" && token.text.trim()) removed++;
  }
  return { added, removed };
}
