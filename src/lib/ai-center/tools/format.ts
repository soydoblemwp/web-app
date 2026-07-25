/** Strips a leading "- ", "1. " or "1) " bullet marker, without touching timestamps like "00:00 ...". */
export function stripBulletMarker(line: string): string {
  return line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "");
}

/** Removes case-insensitive duplicate lines, keeping first-seen order. Used by the tags/hashtags tools. */
export function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}
