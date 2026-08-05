import zlib from "node:zlib";

/**
 * Real, independent PDF text extraction for tests — never just "the Blob is
 * non-empty" (spec section 47: "no compruebes solamente que existe un
 * Blob"). pdf-lib compresses every content stream with FlateDecode by
 * default and encodes drawn text as hex-string literals (`<...> Tj`), so
 * this inflates every stream and hex-decodes every show-text operand,
 * concatenating the result — genuine proof specific text was drawn, not a
 * guess. Verified against pdf-lib's own output before use in real tests.
 */
/** Inflates every FlateDecode content stream in a pdf-lib-produced PDF and concatenates the raw operator text — the shared decompression step behind `extractPdfDrawnText`, also reusable for asserting on drawing operators (e.g. counting `re` rectangle ops) rather than just text. */
export function inflatePdfContentStreams(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const raw = buf.toString("latin1");
  let inflatedContent = "";
  const streamStart = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamStart.exec(raw))) {
    const start = match.index + match[0].length;
    const endIdx = raw.indexOf("endstream", start);
    if (endIdx === -1) continue;
    // The EOL before "endstream" is at most one marker (\r\n, \n, or \r) per the PDF spec — a greedy
    // strip of every trailing \n/\r byte can eat real compressed bytes that happen to equal 0x0A/0x0D,
    // corrupting the zlib trailer. Try the un-trimmed length first, then each single-marker candidate,
    // and use whichever one actually inflates.
    const candidateEnds = [endIdx];
    if (endIdx > start && (raw[endIdx - 1] === "\n" || raw[endIdx - 1] === "\r")) {
      candidateEnds.push(endIdx - 1);
      if (endIdx > start + 1 && raw[endIdx - 2] === "\r" && raw[endIdx - 1] === "\n") candidateEnds.push(endIdx - 2);
    }
    for (const end of candidateEnds) {
      try {
        inflatedContent += zlib.inflateSync(buf.subarray(start, end)).toString("latin1") + "\n";
        break;
      } catch {
        // Try the next candidate boundary; if none work this isn't a FlateDecode stream (e.g. an embedded image).
      }
    }
  }
  return inflatedContent;
}

export function extractPdfDrawnText(bytes: Uint8Array): string {
  const inflatedContent = inflatePdfContentStreams(bytes);
  let decoded = "";
  const hexLiteralBeforeTj = /<([0-9A-Fa-f]+)>\s*Tj/g;
  let hexMatch: RegExpExecArray | null;
  while ((hexMatch = hexLiteralBeforeTj.exec(inflatedContent))) {
    const hex = hexMatch[1];
    for (let i = 0; i < hex.length; i += 2) decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return decoded;
}
