/** Builds a real unified-diff-format string (`---`/`+++` headers, `@@` hunks) from line-diff tokens — filenames are sanitized to a single line so a malicious name can never inject extra header lines. */
export interface UnifiedDiffLine {
  type: "equal" | "added" | "removed";
  text: string;
}

function sanitizeHeaderName(name: string): string {
  return name.replace(/[\r\n]/g, " ").slice(0, 200) || "archivo";
}

export function buildUnifiedDiff(lines: UnifiedDiffLine[], nameA: string, nameB: string, contextLines = 3): string {
  const safeA = sanitizeHeaderName(nameA);
  const safeB = sanitizeHeaderName(nameB);
  const out: string[] = [`--- ${safeA}`, `+++ ${safeB}`];

  // Group changed lines into hunks separated by runs of `equal` lines longer than 2*contextLines,
  // each hunk keeping up to `contextLines` of surrounding equal lines (standard unified-diff shape).
  type Hunk = { startIndex: number; endIndex: number };
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "equal") {
      const start = i;
      let end = i;
      let j = i + 1;
      while (j < lines.length) {
        if (lines[j].type !== "equal") {
          end = j;
          j++;
          continue;
        }
        let k = j;
        while (k < lines.length && lines[k].type === "equal" && k - j < contextLines * 2) k++;
        if (k < lines.length && lines[k].type !== "equal") {
          end = k;
          j = k + 1;
          continue;
        }
        break;
      }
      hunks.push({ startIndex: Math.max(0, start - contextLines), endIndex: Math.min(lines.length - 1, end + contextLines) });
      i = end + 1;
    } else {
      i++;
    }
  }

  let oldLineNum = 1;
  let newLineNum = 1;
  const lineOldNumbers: number[] = [];
  const lineNewNumbers: number[] = [];
  for (const line of lines) {
    lineOldNumbers.push(oldLineNum);
    lineNewNumbers.push(newLineNum);
    if (line.type !== "added") oldLineNum++;
    if (line.type !== "removed") newLineNum++;
  }

  for (const hunk of hunks) {
    const slice = lines.slice(hunk.startIndex, hunk.endIndex + 1);
    const oldCount = slice.filter((l) => l.type !== "added").length;
    const newCount = slice.filter((l) => l.type !== "removed").length;
    out.push(`@@ -${lineOldNumbers[hunk.startIndex]},${oldCount} +${lineNewNumbers[hunk.startIndex]},${newCount} @@`);
    for (const line of slice) {
      const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
      out.push(prefix + line.text);
    }
  }

  return out.join("\n") + "\n";
}
