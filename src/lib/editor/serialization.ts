/**
 * Every existing ContentItem.body was written before this editor existed —
 * either hand-typed plain text or AI-generated plain text with blank-line
 * paragraph breaks (see src/lib/ai/local/, src/server/actions/content.ts).
 * Tiptap needs real HTML: a bare string with no tags is parsed as a single
 * unbroken paragraph, collapsing every newline. This converts legacy plain
 * text into paragraph-per-blank-line HTML on load; anything that already
 * looks like HTML (from this editor going forward) passes through as-is.
 */
export function toEditorHtml(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) return "<p></p>";

  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(trimmed);
  if (looksLikeHtml) return trimmed;

  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
