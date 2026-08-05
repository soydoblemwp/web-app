import * as cheerio from "cheerio";
import { isTag, type Element } from "domhandler";
import type { ExtractedBlock, ExtractionResult } from "@/lib/knowledge/types";

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
const BLOCK_TAGS = [...HEADING_TAGS, "p", "li", "tr", "pre", "blockquote"];
const SELECTOR = BLOCK_TAGS.join(",");

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Own text of an element, excluding any nested block-level descendant (so a <li><p>…</p></li> isn't double-counted once via "li" and once via "p"). */
function ownText($: cheerio.CheerioAPI, el: Element): string {
  const clone = $(el).clone();
  clone.find(BLOCK_TAGS.join(",") + ",script,style,table,ul,ol").remove();
  return collapse(clone.text());
}

/**
 * Shared structural HTML walker — used both by the HTML extractor and by
 * the DOCX extractor (mammoth converts to HTML first, then this same walker
 * turns it into blocks, so structure logic is never duplicated per format).
 * Strips <script>/<style> before anything else (spec section 11), never
 * executes anything.
 */
export function extractStructuredHtml(html: string, method: string): ExtractionResult {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, iframe, object, embed").remove();

  const blocks: ExtractedBlock[] = [];
  let currentHeading: string | undefined;
  let title: string | undefined;
  const docTitle = collapse($("title").first().text());
  if (docTitle) title = docTitle;

  $(SELECTOR).each((_, node) => {
    if (!isTag(node)) return;
    const el: Element = node;
    const tag = el.tagName?.toLowerCase();
    if (!tag) return;

    if (tag === "tr") {
      const cells = $(el)
        .children("td,th")
        .map((__, cell) => collapse($(cell).text()))
        .get()
        .filter(Boolean);
      if (cells.length > 0) blocks.push({ kind: "table_row", text: cells.join(" | "), heading: currentHeading });
      return;
    }

    const text = ownText($, el);
    if (!text) return;

    if (HEADING_TAGS.includes(tag)) {
      const level = Number(tag[1]);
      blocks.push({ kind: "heading", text, level, heading: currentHeading });
      currentHeading = text;
      if (!title && level <= 2) title = text;
      return;
    }
    if (tag === "li") {
      blocks.push({ kind: "list_item", text, heading: currentHeading });
      return;
    }
    if (tag === "pre") {
      blocks.push({ kind: "code", text, heading: currentHeading });
      return;
    }
    blocks.push({ kind: "paragraph", text, heading: currentHeading });
  });

  return {
    ok: true,
    text: blocks.map((b) => b.text).join("\n\n"),
    blocks,
    title,
    sectionCount: blocks.filter((b) => b.kind === "heading").length,
    warnings: blocks.length === 0 ? ["No se encontró contenido de texto reconocible en el HTML."] : [],
    quality: blocks.length > 0 ? "HIGH" : "NONE",
    method,
    metadata: { blockCount: blocks.length },
  };
}

export function extractHtml(html: string): ExtractionResult {
  return extractStructuredHtml(html, "html");
}
