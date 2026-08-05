import { computeChecksum } from "@/lib/knowledge/checksum";
import type { ChunkDraft, ChunkingOptions, ExtractedBlock } from "@/lib/knowledge/types";

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 150;
const DEFAULT_MIN_CHARS = 200;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function lastPageOf(list: ExtractedBlock[]): number | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].page !== undefined) return list[i].page;
  }
  return undefined;
}

function lastHeadingOf(list: ExtractedBlock[]): string | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].kind === "heading") return list[i].text;
  }
  return list[0]?.heading;
}

/**
 * Deterministic, configurable chunking (spec section 13). Prioritizes
 * natural boundaries — a new heading, or a page change (for PDFs) — over a
 * hard character limit, but only once the current buffer already has a
 * reasonable amount of content (`minChars`), so short sections don't get
 * fragmented into tiny chunks. A single block (a CSV row, a table row, a
 * whole paragraph) is never split mid-block. Overlap is only applied on a
 * char-limit flush, never on a natural-boundary flush (spec: "no dupliques
 * bloques completos innecesariamente").
 */
export function chunkBlocks(blocks: ExtractedBlock[], options: ChunkingOptions = {}): ChunkDraft[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;

  const drafts: ChunkDraft[] = [];
  let order = 0;
  let globalOffset = 0;

  let current: ExtractedBlock[] = [];
  let currentText = "";
  let currentStart = 0;
  let pendingOverlap = "";

  function pushChunk(carryOverlap: boolean) {
    if (current.length === 0) return;
    const text = currentText.trim();
    if (text) {
      const heading = lastHeadingOf(current);
      const page = lastPageOf(current);
      const first = current[0];
      const labelParts: string[] = [];
      if (page !== undefined) labelParts.push(`Página ${page}`);
      if (first.rowIndex !== undefined) labelParts.push(`Fila ${first.rowIndex}`);
      if (first.jsonPath) labelParts.push(first.jsonPath);
      if (heading) labelParts.push(heading);

      drafts.push({
        order: order++,
        text,
        heading,
        page,
        rowIndex: first.rowIndex,
        jsonPath: first.jsonPath,
        locationLabel: labelParts.length > 0 ? labelParts.join(" · ") : undefined,
        charStart: currentStart,
        charEnd: currentStart + text.length,
        checksum: computeChecksum(text),
        sizeChars: text.length,
        tokenEstimate: estimateTokens(text),
      });
      globalOffset = currentStart + text.length;
    }
    pendingOverlap = carryOverlap ? text.slice(Math.max(0, text.length - overlapChars)) : "";
    current = [];
    currentText = "";
  }

  for (const block of blocks) {
    const blockPage = lastPageOf(current);
    const atNaturalBoundary = current.length > 0 && (block.kind === "heading" || (block.page !== undefined && blockPage !== undefined && blockPage !== block.page));

    if (atNaturalBoundary && currentText.length >= minChars) {
      pushChunk(false);
    }

    const projectedLength = currentText.length + (currentText ? 2 : 0) + block.text.length;
    if (currentText.length > 0 && projectedLength > maxChars) {
      pushChunk(true);
    }

    if (current.length === 0) {
      currentStart = globalOffset;
      if (pendingOverlap) currentText = pendingOverlap;
    }
    currentText = currentText ? `${currentText}\n\n${block.text}` : block.text;
    current.push(block);
  }
  pushChunk(false);

  return drafts;
}
