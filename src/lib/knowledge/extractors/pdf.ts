import { getDocumentProxy, extractText, getMeta } from "unpdf";
import type { ExtractedBlock, ExtractionResult } from "@/lib/knowledge/types";

/** A page counts as "with text" once it has more than this many non-whitespace characters — below this it's treated as effectively empty (spec section 8: "detecta páginas vacías"). */
const MIN_PAGE_CHARS = 20;
/** Below this share of pages having real text, the document is treated as a probable scanned PDF (spec section 8: "identifica probable PDF escaneado"). */
const MIN_TEXT_PAGE_RATIO = 0.1;

function splitParagraphs(pageText: string): string[] {
  return pageText
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * PDF — real per-page text extraction via unpdf (a serverless-friendly
 * wrapper around Mozilla's pdf.js, no native deps). Never runs OCR: a
 * page/document with too little real text is flagged `needsOcr` instead of
 * guessing its contents (spec section 8).
 */
export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch {
    return { ok: false, text: "", blocks: [], warnings: [], quality: "NONE", method: "pdf-unpdf", metadata: {}, errorCode: "EXTRACTION_FAILED" };
  }

  const { totalPages, text: pageTexts } = await extractText(pdf, { mergePages: false });

  let title: string | undefined;
  let author: string | undefined;
  try {
    const meta = await getMeta(pdf);
    title = typeof meta.info?.Title === "string" && meta.info.Title.trim() ? meta.info.Title.trim() : undefined;
    author = typeof meta.info?.Author === "string" && meta.info.Author.trim() ? meta.info.Author.trim() : undefined;
  } catch {
    // Metadata is best-effort only — extraction itself already succeeded.
  }

  const blocks: ExtractedBlock[] = [];
  let pagesWithText = 0;
  const warnings: string[] = [];

  pageTexts.forEach((rawPageText, index) => {
    const pageNumber = index + 1;
    const trimmed = rawPageText.replace(/\s+/g, " ").trim();
    if (trimmed.length < MIN_PAGE_CHARS) {
      warnings.push(`La página ${pageNumber} no tiene texto extraíble.`);
      return;
    }
    pagesWithText++;
    for (const paragraph of splitParagraphs(rawPageText)) {
      blocks.push({ kind: "paragraph", text: paragraph, page: pageNumber });
    }
  });

  const textPageRatio = totalPages > 0 ? pagesWithText / totalPages : 0;
  const needsOcr = totalPages > 0 && textPageRatio < MIN_TEXT_PAGE_RATIO;

  if (needsOcr) {
    return {
      ok: true,
      text: "",
      blocks: [],
      title,
      author,
      pageCount: totalPages,
      warnings: [...warnings, "Este PDF parece ser un documento escaneado (imagen) sin capa de texto suficiente."],
      quality: "NONE",
      method: "pdf-unpdf",
      metadata: { totalPages, pagesWithText },
      needsOcr: true,
      errorCode: "OCR_REQUIRED",
    };
  }

  return {
    ok: true,
    text: blocks.map((b) => b.text).join("\n\n"),
    blocks,
    title,
    author,
    pageCount: totalPages,
    warnings,
    quality: textPageRatio > 0.8 ? "HIGH" : textPageRatio > 0.4 ? "MEDIUM" : "LOW",
    method: "pdf-unpdf",
    metadata: { totalPages, pagesWithText, textPageRatioPercent: Math.round(textPageRatio * 100) },
  };
}
