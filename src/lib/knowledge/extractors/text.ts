import type { ExtractedBlock, ExtractionResult } from "@/lib/knowledge/types";

function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** TXT — the plainest real extractor: paragraphs split on blank lines, no structure invented. */
export function extractPlainText(text: string): ExtractionResult {
  const paragraphs = splitParagraphs(text);
  const blocks: ExtractedBlock[] = paragraphs.map((p) => ({ kind: "paragraph", text: p }));
  return {
    ok: true,
    text: paragraphs.join("\n\n"),
    blocks,
    warnings: [],
    quality: paragraphs.length > 0 ? "HIGH" : "NONE",
    method: "text-plain",
    metadata: { paragraphCount: paragraphs.length },
  };
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_ITEM_RE = /^\s*\d+[.)]\s+(.*)$/;

/** MARKDOWN — real structural parsing: headings (with level + hierarchy), list items, and paragraphs, in document order. Never a "resumen"; the structure is preserved as-is (spec section 12). */
export function extractMarkdown(text: string): ExtractionResult {
  const lines = text.split(/\r?\n/);
  const blocks: ExtractedBlock[] = [];
  let currentHeading: string | undefined;
  let buffer: string[] = [];
  let title: string | undefined;

  function flush() {
    if (buffer.length === 0) return;
    const paragraph = buffer.join(" ").trim();
    if (paragraph) blocks.push({ kind: "paragraph", text: paragraph, heading: currentHeading });
    buffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const headingText = heading[2].trim();
      blocks.push({ kind: "heading", text: headingText, level, heading: currentHeading });
      currentHeading = headingText;
      if (!title && level <= 2) title = headingText;
      continue;
    }
    const listItem = LIST_ITEM_RE.exec(line) ?? ORDERED_ITEM_RE.exec(line);
    if (listItem) {
      flush();
      blocks.push({ kind: "list_item", text: listItem[1].trim(), heading: currentHeading });
      continue;
    }
    buffer.push(line.trim());
  }
  flush();

  const fullText = blocks.map((b) => b.text).join("\n\n");
  return {
    ok: true,
    text: fullText,
    blocks,
    title,
    sectionCount: blocks.filter((b) => b.kind === "heading").length,
    warnings: [],
    quality: blocks.length > 0 ? "HIGH" : "NONE",
    method: "text-markdown",
    metadata: { blockCount: blocks.length },
  };
}
