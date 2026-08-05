import * as cheerio from "cheerio";
import { normalizeWhitespace, stripControlCharacters } from "@/lib/customer-support/sanitize";

/**
 * HTML -> safe plain text for the internal-page sync feature (spec section
 * 12: "eliminar scripts; eliminar estilos; eliminar navegacion repetida;
 * eliminar formularios; sanear HTML; normalizar texto"). The removal
 * denylist mirrors src/lib/knowledge/extractors/html.ts's proven list
 * (script/style/noscript/nav/iframe/object/embed), extended with
 * form-related tags since this feature never needs to capture interactive
 * elements from a page.
 */

const REMOVED_SELECTORS = "script, style, noscript, nav, iframe, object, embed, form, input, button, select, textarea, header, footer";

export interface SanitizedHtmlResult {
  title: string | null;
  text: string;
}

export function sanitizeHtmlToText(html: string): SanitizedHtmlResult {
  const $ = cheerio.load(html);
  $(REMOVED_SELECTORS).remove();
  // Strip any inline event-handler attribute or javascript: link target that could otherwise survive as text-adjacent markup - defense in depth even though only .text() is ever read below.
  $("*").each((_, el) => {
    if (!("attribs" in el)) return;
    const attribs = (el as unknown as { attribs: Record<string, string> }).attribs;
    for (const name of Object.keys(attribs)) {
      if (name.toLowerCase().startsWith("on")) delete attribs[name];
    }
  });

  const title = normalizeWhitespace(stripControlCharacters($("title").first().text())) || null;
  const rawText = $("body").length ? $("body").text() : $.root().text();
  const text = normalizeWhitespace(stripControlCharacters(rawText));

  return { title, text };
}
