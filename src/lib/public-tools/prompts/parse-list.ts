/** Parses a "1. foo\n2. bar" style numbered list into plain strings — the same output convention every AI Center prompt already uses, reused here so parsing logic isn't duplicated per tool. */
export function parseNumberedList(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*[\d]+[.)]\s*/, "").replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

/** Parses a "SECTION_NAME:\n...content...\nOTHER_SECTION:\n" block format into a map, for prompts that return several labeled sections in one response. */
export function parseLabeledSections(raw: string, labels: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const nextLabels = labels.slice(i + 1);
    const startPattern = new RegExp(`${label}\\s*:?\\s*\\n?`, "i");
    const startMatch = startPattern.exec(raw);
    if (!startMatch) continue;
    const startIndex = startMatch.index + startMatch[0].length;
    let endIndex = raw.length;
    for (const nextLabel of nextLabels) {
      const nextMatch = new RegExp(`${nextLabel}\\s*:`, "i").exec(raw.slice(startIndex));
      if (nextMatch) {
        endIndex = Math.min(endIndex, startIndex + nextMatch.index);
      }
    }
    result[label] = raw.slice(startIndex, endIndex).trim();
  }
  return result;
}
