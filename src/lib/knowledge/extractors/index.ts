import { extractPlainText, extractMarkdown } from "@/lib/knowledge/extractors/text";
import { extractCsv } from "@/lib/knowledge/extractors/csv";
import { extractJson } from "@/lib/knowledge/extractors/json";
import { extractHtml } from "@/lib/knowledge/extractors/html";
import { extractDocx } from "@/lib/knowledge/extractors/docx";
import { extractPdf } from "@/lib/knowledge/extractors/pdf";
import type { ExtractionResult, KnowledgeSourceFormat } from "@/lib/knowledge/types";

export { extractPlainText, extractMarkdown, extractCsv, extractJson, extractHtml, extractDocx, extractPdf };

/** The ONE dispatch point every extraction stage goes through — never a per-format branch duplicated elsewhere (spec section 7). */
export async function extractByFormat(format: KnowledgeSourceFormat, input: { text?: string; buffer?: Buffer }): Promise<ExtractionResult> {
  switch (format) {
    case "TEXT":
      return extractPlainText(input.text ?? "");
    case "MARKDOWN":
      return extractMarkdown(input.text ?? "");
    case "CSV":
      return extractCsv(input.text ?? "");
    case "JSON":
      return extractJson(input.text ?? "");
    case "HTML":
      return extractHtml(input.text ?? "");
    case "DOCX":
      if (!input.buffer) return failResult("docx");
      return extractDocx(input.buffer);
    case "PDF":
      if (!input.buffer) return failResult("pdf-unpdf");
      return extractPdf(input.buffer);
    default:
      return { ...failResult("unknown"), errorCode: "UNSUPPORTED_FILE_TYPE" };
  }
}

function failResult(method: string): ExtractionResult {
  return { ok: false, text: "", blocks: [], warnings: [], quality: "NONE", method, metadata: {}, errorCode: "EXTRACTION_FAILED" };
}

/** Maps a FileAsset's mimeType/filename to a real supported format, or null when unsupported (spec section 3: never claim support beyond what's actually processed). */
export function detectFormatFromFile(mimeType: string, filename: string): KnowledgeSourceFormat | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return "PDF";
  if (mimeType.includes("wordprocessingml.document") || ext === "docx") return "DOCX";
  if (mimeType === "text/csv" || ext === "csv") return "CSV";
  if (mimeType === "application/json" || ext === "json") return "JSON";
  if (mimeType === "text/html" || ext === "html" || ext === "htm") return "HTML";
  if (ext === "md" || ext === "markdown" || mimeType === "text/markdown") return "MARKDOWN";
  if (mimeType.startsWith("text/") || ext === "txt") return "TEXT";
  return null;
}
