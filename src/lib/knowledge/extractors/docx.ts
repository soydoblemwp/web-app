import mammoth from "mammoth";
import { extractStructuredHtml } from "@/lib/knowledge/extractors/html";
import type { ExtractionResult } from "@/lib/knowledge/types";

/**
 * DOCX — real extraction via mammoth (pure JS, no native deps): converts to
 * HTML preserving headings/lists/tables/links/structure, then reuses the
 * SAME structural HTML walker the HTML extractor uses (spec section 9: never
 * store raw XML as indexable text, never duplicate the structure-walking
 * logic).
 */
export async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  let html: string;
  let messages: { type: string; message: string }[];
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value;
    messages = result.messages;
  } catch {
    return { ok: false, text: "", blocks: [], warnings: [], quality: "NONE", method: "docx", metadata: {}, errorCode: "EXTRACTION_FAILED" };
  }

  const extracted = extractStructuredHtml(html, "docx-mammoth");
  const warnings = [...extracted.warnings, ...messages.filter((m) => m.type === "warning").map((m) => m.message)];
  return { ...extracted, warnings, metadata: { ...extracted.metadata, mammothWarningCount: messages.length } };
}
