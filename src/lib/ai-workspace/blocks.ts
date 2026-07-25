/**
 * Splits a generated result's raw text into renderable blocks: fenced code,
 * bulleted/numbered lists, tables, blockquotes, headings and paragraphs.
 * Pure and dependency-free on purpose — no markdown library — so it stays
 * cheap to run on every result in the workspace history AND on every chat
 * message. Used by UniversalResultViewer, which every AI Center tool's
 * result (YouTube, Chat IA, and any future platform) renders through — one
 * parser, one renderer, never a second one.
 */
export type ResultBlock =
  | { kind: "code"; language: string | null; content: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "quote"; content: string }
  | { kind: "heading"; content: string }
  | { kind: "paragraph"; content: string };

/** One piece of inline text within a paragraph/list-item/quote — plain text or a link (markdown or bare URL). */
export type InlineSegment = { type: "text"; content: string } | { type: "link"; content: string; href: string };

const BULLET_RE = /^[-*]\s+(.*)$/;
const NUMBERED_RE = /^\d+[.)]\s+(.*)$/;
const HEADING_RE = /^#{1,6}\s+(.*)$/;
const FENCE_RE = /^```(\w+)?\s*$/;
const QUOTE_RE = /^>\s?(.*)$/;
const TABLE_ROW_RE = /^\|?.+\|.*$/;
const TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/;

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

export function parseResultBlocks(body: string): ResultBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ResultBlock[] = [];

  let paragraphBuffer: string[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let quoteBuffer: string[] = [];

  const flushParagraph = () => {
    const text = paragraphBuffer.join("\n").trim();
    if (text) blocks.push({ kind: "paragraph", content: text });
    paragraphBuffer = [];
  };
  const flushList = () => {
    if (listBuffer && listBuffer.items.length > 0) {
      blocks.push({ kind: "list", ordered: listBuffer.ordered, items: listBuffer.items });
    }
    listBuffer = null;
  };
  const flushQuote = () => {
    const text = quoteBuffer.join("\n").trim();
    if (text) blocks.push({ kind: "quote", content: text });
    quoteBuffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);

    if (fenceMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      const language = fenceMatch[1] ?? null;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "code", language, content: codeLines.join("\n") });
      i++; // skip the closing fence
      continue;
    }

    // GFM-style table: a row containing "|" immediately followed by a
    // "|---|---|" separator line.
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1].trim())) {
      flushParagraph();
      flushList();
      flushQuote();
      const headers = splitTableRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]) && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({ kind: "heading", content: headingMatch[1].trim() });
      i++;
      continue;
    }

    const quoteMatch = line.match(QUOTE_RE);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteBuffer.push(quoteMatch[1]);
      i++;
      continue;
    }

    const bulletMatch = line.match(BULLET_RE);
    const numberedMatch = line.match(NUMBERED_RE);
    if (bulletMatch || numberedMatch) {
      flushParagraph();
      flushQuote();
      const ordered = Boolean(numberedMatch);
      const text = (bulletMatch ?? numberedMatch)![1].trim();
      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList();
        listBuffer = { ordered, items: [] };
      }
      listBuffer.items.push(text);
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      flushQuote();
      i++;
      continue;
    }

    flushList();
    flushQuote();
    paragraphBuffer.push(line);
    i++;
  }

  flushParagraph();
  flushList();
  flushQuote();

  return blocks;
}

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL_RE = /(https?:\/\/[^\s]+)/g;

/** Splits inline text into plain-text and link segments — markdown `[text](url)` links and bare URLs alike. */
export function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];

  const pushText = (value: string) => {
    if (value) segments.push({ type: "text", content: value });
  };

  MARKDOWN_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  const withMarkdownLinksResolved: InlineSegment[] = [];
  while ((match = MARKDOWN_LINK_RE.exec(text))) {
    if (match.index > lastIndex) withMarkdownLinksResolved.push({ type: "text", content: text.slice(lastIndex, match.index) });
    withMarkdownLinksResolved.push({ type: "link", content: match[1], href: match[2] });
    lastIndex = MARKDOWN_LINK_RE.lastIndex;
  }
  if (lastIndex < text.length) withMarkdownLinksResolved.push({ type: "text", content: text.slice(lastIndex) });

  // Second pass: within the remaining plain-text segments, also linkify bare URLs.
  for (const segment of withMarkdownLinksResolved) {
    if (segment.type === "link") {
      segments.push(segment);
      continue;
    }
    BARE_URL_RE.lastIndex = 0;
    let urlMatch: RegExpExecArray | null;
    let urlCursor = 0;
    while ((urlMatch = BARE_URL_RE.exec(segment.content))) {
      pushText(segment.content.slice(urlCursor, urlMatch.index));
      segments.push({ type: "link", content: urlMatch[1], href: urlMatch[1] });
      urlCursor = BARE_URL_RE.lastIndex;
    }
    pushText(segment.content.slice(urlCursor));
  }

  return segments;
}
