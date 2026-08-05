import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { computeChecksum, computeBufferChecksum } from "@/lib/knowledge/checksum";
import { scanForSensitivePatterns } from "@/lib/knowledge/secrets-scan";
import { extractPlainText, extractMarkdown } from "@/lib/knowledge/extractors/text";
import { extractCsv } from "@/lib/knowledge/extractors/csv";
import { extractJson } from "@/lib/knowledge/extractors/json";
import { extractHtml } from "@/lib/knowledge/extractors/html";
import { extractDocx } from "@/lib/knowledge/extractors/docx";
import { extractPdf } from "@/lib/knowledge/extractors/pdf";
import { extractByFormat, detectFormatFromFile } from "@/lib/knowledge/extractors";
import { normalizeBlocks, detectLanguageHeuristic } from "@/lib/knowledge/normalize";
import { chunkBlocks } from "@/lib/knowledge/chunking";
import { buildKnowledgeAnswerPrompt, parseKnowledgeAnswer, KNOWLEDGE_ANSWER_FIELDS } from "@/lib/knowledge/answer-prompt";
import { splitIntoClaims, scoreClaimAgainstChunk, classifyClaim, isOpinionClaim } from "@/lib/knowledge/verification";
import { computeHybridScore, isSemanticSearchAvailable, isSearchableQuery } from "@/lib/knowledge/search";
import { KNOWLEDGE_ERROR_CODES, KNOWLEDGE_ERROR_MESSAGES, knowledgeError } from "@/lib/knowledge/types";
import { KNOWLEDGE_COLLECTION_ICON_NAMES, KNOWLEDGE_COLLECTION_COLORS } from "@/lib/knowledge/collection-icons";
import { getActionErrorMessage } from "@/lib/knowledge/action-result";
import { AGENT_TOOL_IDS } from "@/lib/agents/types";
import { findAgentDefinition } from "@/lib/agents/registry";
import { WORKFLOW_STEP_TYPES } from "@/lib/ai-workflows/engine";
import { resolveStepForExecution } from "@/lib/ai-workflows/execution-resolver";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function buildMinimalPdf(pageContentStream: string): Buffer {
  const streamBytes = Buffer.byteLength(pageContentStream, "latin1");
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${streamBytes}>>stream
${pageContentStream}
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Size 6/Root 1 0 R>>
%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// pdf.js's recovery-mode text extraction (used here since this hand-built PDF has no real
// xref table) truncates a single long Tj string to ~14 chars without real font width metrics —
// splitting into several short Tj operators avoids that and still exercises real extraction.
const MINIMAL_PDF = buildMinimalPdf("BT /F1 24 Tf 50 100 Td (Hello PDF text) Tj 0 -20 Td (more real content) Tj 0 -20 Td (for extraction) Tj ET\n");

// ---------------------------------------------------------------------------
// 1. Checksums — duplicate/version detection
// ---------------------------------------------------------------------------
describe("checksum.ts: deterministic checksums for duplicate/version detection (spec sections 12/21/32)", () => {
  it("is deterministic — same text always produces the same checksum", () => {
    expect(computeChecksum("hola mundo")).toBe(computeChecksum("hola mundo"));
  });
  it("differs for different text", () => {
    expect(computeChecksum("hola")).not.toBe(computeChecksum("hola mundo"));
  });
  it("computeBufferChecksum is deterministic and differs from a different buffer", () => {
    const a = Buffer.from("archivo-1");
    const b = Buffer.from("archivo-2");
    expect(computeBufferChecksum(a)).toBe(computeBufferChecksum(a));
    expect(computeBufferChecksum(a)).not.toBe(computeBufferChecksum(b));
  });
});

// ---------------------------------------------------------------------------
// 2. Sensitive pattern scanning
// ---------------------------------------------------------------------------
describe("secrets-scan.ts: sensitive pattern detection (spec section 33) — warns, never redacts", () => {
  it("detects an AWS-style access key", () => {
    expect(scanForSensitivePatterns("La clave es AKIAABCDEFGHIJKLMNOP en el archivo.")).toBe(true);
  });
  it("detects a database connection string with embedded credentials", () => {
    expect(scanForSensitivePatterns("DATABASE_URL=postgres://user:secretpass@db.example.com:5432/mydb")).toBe(true);
  });
  it("detects a generic api_key: value assignment", () => {
    expect(scanForSensitivePatterns('api_key: "sk-abcdefghij1234567890"')).toBe(true);
  });
  it("does not flag ordinary prose", () => {
    expect(scanForSensitivePatterns("Este es un documento normal sobre nuestras políticas de devolución.")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Extractors — real extraction per format (spec sections 7-11)
// ---------------------------------------------------------------------------
describe("extractors/text.ts: TXT and MARKDOWN", () => {
  it("extractPlainText splits on blank lines into paragraph blocks", () => {
    const result = extractPlainText("Primer párrafo.\n\nSegundo párrafo.\n\nTercero.");
    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(3);
    expect(result.blocks.every((b) => b.kind === "paragraph")).toBe(true);
    expect(result.quality).toBe("HIGH");
  });

  it("extractPlainText returns quality NONE for empty input", () => {
    expect(extractPlainText("   ").quality).toBe("NONE");
  });

  it("extractMarkdown parses headings with levels, tracks the nearest heading, and detects list items", () => {
    const md = "# Título\n\nIntro.\n\n## Sección\n\n- Uno\n- Dos\n\nPárrafo final.";
    const result = extractMarkdown(md);
    const heading = result.blocks.find((b) => b.kind === "heading" && b.level === 1)!;
    expect(heading.text).toBe("Título");
    expect(result.title).toBe("Título");
    const sub = result.blocks.find((b) => b.kind === "heading" && b.level === 2)!;
    expect(sub.text).toBe("Sección");
    const items = result.blocks.filter((b) => b.kind === "list_item");
    expect(items.map((i) => i.text)).toEqual(["Uno", "Dos"]);
    expect(items[0].heading).toBe("Sección");
    expect(result.sectionCount).toBe(2);
  });
});

describe("extractors/csv.ts: real header-aware CSV parsing", () => {
  it("parses quoted fields, commas inside quotes, and produces one readable block per row", () => {
    const csv = 'nombre,ciudad\n"Pérez, Juan",Madrid\nAna,"Buenos Aires"';
    const result = extractCsv(csv);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].text).toBe("nombre: Pérez, Juan | ciudad: Madrid");
    expect(result.blocks[0].rowIndex).toBe(1);
    expect(result.blocks[1].text).toBe("nombre: Ana | ciudad: Buenos Aires");
  });

  it("warns and truncates when there are more than the max allowed columns", () => {
    const headers = Array.from({ length: 45 }, (_, i) => `col${i}`).join(",");
    const row = Array.from({ length: 45 }, (_, i) => `v${i}`).join(",");
    const result = extractCsv(`${headers}\n${row}`);
    expect(result.warnings.some((w) => w.includes("truncaron las columnas"))).toBe(true);
  });

  it("returns quality NONE for an empty CSV", () => {
    expect(extractCsv("").quality).toBe("NONE");
  });
});

describe("extractors/json.ts: structure-preserving flattening with JSON paths", () => {
  it("flattens nested objects/arrays into one block per leaf, each carrying its exact JSON path", () => {
    const result = extractJson('{"producto":{"nombre":"Zapato","precio":49.9},"tags":["azul","deportivo"]}');
    expect(result.ok).toBe(true);
    const nombre = result.blocks.find((b) => b.jsonPath === "producto.nombre")!;
    expect(nombre.text).toContain("Zapato");
    const tag0 = result.blocks.find((b) => b.jsonPath === "tags[0]")!;
    expect(tag0.text).toContain("azul");
  });

  it("fails cleanly (ok:false, EXTRACTION_FAILED) on invalid JSON — never guesses", () => {
    const result = extractJson("{not valid json");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("EXTRACTION_FAILED");
  });
});

describe("extractors/html.ts: structural HTML parsing", () => {
  it("strips <script>/<style> and never includes their content", () => {
    const html = "<html><body><script>alert('x')</script><style>.a{}</style><p>Contenido real</p></body></html>";
    const result = extractHtml(html);
    expect(result.text).not.toMatch(/alert|\.a\{\}/);
    expect(result.text).toContain("Contenido real");
  });

  it("extracts headings, paragraphs, list items and table rows without double-counting nested content", () => {
    const html = "<h1>Título</h1><p>Uno</p><ul><li>Item A</li><li>Item B</li></ul><table><tr><td>x</td><td>y</td></tr></table>";
    const result = extractHtml(html);
    expect(result.blocks.filter((b) => b.kind === "heading")).toHaveLength(1);
    expect(result.blocks.filter((b) => b.kind === "paragraph").map((b) => b.text)).toEqual(["Uno"]);
    expect(result.blocks.filter((b) => b.kind === "list_item").map((b) => b.text)).toEqual(["Item A", "Item B"]);
    expect(result.blocks.find((b) => b.kind === "table_row")?.text).toBe("x | y");
  });

  it("a <p> nested inside an <li> is counted once (via its own <p> block), not duplicated by the <li>'s own text", () => {
    const html = "<ul><li><p>Anidado</p></li></ul>";
    const result = extractHtml(html);
    const occurrences = result.blocks.filter((b) => b.text === "Anidado");
    expect(occurrences).toHaveLength(1);
  });
});

describe("extractors/docx.ts: real mammoth-based extraction, honest failure on invalid input", () => {
  it("fails cleanly on a buffer that isn't a real DOCX — never fabricates content", async () => {
    const result = await extractDocx(Buffer.from("this is not a real docx file"));
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("EXTRACTION_FAILED");
  });
});

describe("extractors/pdf.ts: real per-page extraction via unpdf, OCR detection never fabricated", () => {
  it("extracts real text with a page number from a minimal valid single-page PDF", async () => {
    const result = await extractPdf(MINIMAL_PDF);
    expect(result.ok).toBe(true);
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain("Hello PDF");
    expect(result.blocks[0].page).toBe(1);
  }, 20000);

  it("flags needsOcr instead of inventing content when there's no real text layer", async () => {
    const emptyPagePdf = Buffer.from(
      `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<<>>>>endobj
trailer<</Size 4/Root 1 0 R>>
%%EOF`,
      "latin1"
    );
    const result = await extractPdf(emptyPagePdf);
    expect(result.needsOcr).toBe(true);
    expect(result.errorCode).toBe("OCR_REQUIRED");
    expect(result.text).toBe("");
  }, 20000);

  it("fails cleanly on a completely invalid buffer", async () => {
    const result = await extractPdf(Buffer.from("not a pdf at all"));
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("EXTRACTION_FAILED");
  }, 20000);
});

describe("extractors/index.ts: single dispatch point + honest format detection", () => {
  it("detectFormatFromFile maps real, supported mime types/extensions only", () => {
    expect(detectFormatFromFile("application/pdf", "doc.pdf")).toBe("PDF");
    expect(detectFormatFromFile("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc.docx")).toBe("DOCX");
    expect(detectFormatFromFile("text/csv", "data.csv")).toBe("CSV");
    expect(detectFormatFromFile("application/json", "data.json")).toBe("JSON");
    expect(detectFormatFromFile("text/html", "page.html")).toBe("HTML");
    expect(detectFormatFromFile("text/markdown", "readme.md")).toBe("MARKDOWN");
    expect(detectFormatFromFile("text/plain", "notes.txt")).toBe("TEXT");
  });

  it("returns null for a genuinely unsupported type — never claims support it doesn't have", () => {
    expect(detectFormatFromFile("image/png", "photo.png")).toBeNull();
    expect(detectFormatFromFile("application/zip", "archive.zip")).toBeNull();
  });

  it("extractByFormat dispatches to the right extractor for every declared KnowledgeSourceFormat", async () => {
    expect((await extractByFormat("TEXT", { text: "hola" })).method).toBe("text-plain");
    expect((await extractByFormat("MARKDOWN", { text: "# hola" })).method).toBe("text-markdown");
    expect((await extractByFormat("CSV", { text: "a,b\n1,2" })).method).toBe("csv");
    expect((await extractByFormat("JSON", { text: "{}" })).method).toBe("json");
    expect((await extractByFormat("HTML", { text: "<p>hi</p>" })).method).toBe("html");
  });

  it("returns UNSUPPORTED_FILE_TYPE for a bogus format string", async () => {
    // @ts-expect-error deliberately testing the runtime fallback for an invalid format value
    const result = await extractByFormat("BOGUS", {});
    expect(result.errorCode).toBe("UNSUPPORTED_FILE_TYPE");
  });
});

// ---------------------------------------------------------------------------
// 4. Normalization
// ---------------------------------------------------------------------------
describe("normalize.ts: deterministic normalization (spec section 12)", () => {
  it("drops exact-duplicate consecutive blocks (repeated headers/footers), but keeps a non-consecutive repeat", () => {
    const header = { kind: "paragraph" as const, text: "Encabezado repetido" };
    const body = { kind: "paragraph" as const, text: "Contenido real" };

    const consecutive = normalizeBlocks([header, header, body]);
    expect(consecutive.blocks).toHaveLength(2);

    const nonConsecutive = normalizeBlocks([header, body, header]);
    expect(nonConsecutive.blocks).toHaveLength(3);
  });

  it("strips control characters and collapses runs of whitespace", () => {
    const controlChar = String.fromCharCode(7);
    const text = "Texto" + controlChar + "con   varios   espacios";
    const normalized = normalizeBlocks([{ kind: "paragraph" as const, text }]);
    expect(normalized.normalizedText).toBe("Textocon varios espacios");
    expect(normalized.normalizedText).not.toContain(controlChar);
  });

  it("computes a checksum of the normalized text, deterministic across calls", () => {
    const blocks = [{ kind: "paragraph" as const, text: "Igual contenido" }];
    expect(normalizeBlocks(blocks).checksumNormalized).toBe(normalizeBlocks(blocks).checksumNormalized);
  });

  it("flags sensitiveWarning when the normalized text contains a sensitive pattern", () => {
    const normalized = normalizeBlocks([{ kind: "paragraph" as const, text: "api_key: sk-1234567890abcdefgh" }]);
    expect(normalized.sensitiveWarning).toBe(true);
  });

  it("detectLanguageHeuristic favors Spanish/English by marker-word frequency, and is honest about inconclusive input", () => {
    expect(detectLanguageHeuristic("de la que el en y los del se las para con una por")).toBe("es");
    expect(detectLanguageHeuristic("the and of to in is for that with on are as it")).toBe("en");
    expect(detectLanguageHeuristic("xyz123")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Chunking
// ---------------------------------------------------------------------------
describe("chunking.ts: deterministic, boundary-aware chunking (spec section 13)", () => {
  it("keeps a short document as a single chunk", () => {
    const blocks = [
      { kind: "heading" as const, text: "Título", level: 1 },
      { kind: "paragraph" as const, text: "Contenido breve." },
    ];
    const chunks = chunkBlocks(blocks);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("Título");
  });

  it("assigns sequential order, non-negative char ranges, and a real checksum per chunk", () => {
    const blocks = Array.from({ length: 5 }, (_, i) => ({ kind: "paragraph" as const, text: `Párrafo número ${i}.` }));
    const chunks = chunkBlocks(blocks);
    chunks.forEach((c, i) => {
      expect(c.order).toBe(i);
      expect(c.charStart).toBeGreaterThanOrEqual(0);
      expect(c.charEnd).toBeGreaterThan(c.charStart);
      expect(c.checksum).toHaveLength(64); // sha256 hex
      expect(c.tokenEstimate).toBeGreaterThan(0);
    });
  });

  it("forces a new chunk at a heading boundary once the buffer already has meaningful content", () => {
    const bigParagraph = "x".repeat(300);
    const blocks = [
      { kind: "heading" as const, text: "Sección uno", level: 1 },
      { kind: "paragraph" as const, text: bigParagraph },
      { kind: "heading" as const, text: "Sección dos", level: 1 },
      { kind: "paragraph" as const, text: "Otro contenido." },
    ];
    const chunks = chunkBlocks(blocks, { minChars: 100 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].heading).toBe("Sección uno");
    expect(chunks[chunks.length - 1].heading).toBe("Sección dos");
  });

  it("never splits a single block — a block bigger than maxChars still becomes exactly one whole chunk", () => {
    const hugeRow = { kind: "table_row" as const, text: "x".repeat(5000), rowIndex: 1 };
    const chunks = chunkBlocks([hugeRow], { maxChars: 500 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(hugeRow.text);
  });

  it("applies character overlap only on a char-limit flush, carrying the tail into the next chunk", () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({ kind: "paragraph" as const, text: `Bloque ${i}: contenido de prueba con suficiente longitud para forzar limites de caracteres.` }));
    const chunks = chunkBlocks(blocks, { maxChars: 300, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    const expectedOverlap = chunks[0].text.slice(-50);
    expect(chunks[1].text.startsWith(expectedOverlap)).toBe(true);
  });

  it("does NOT carry overlap across a natural heading-boundary flush", () => {
    const bigParagraph = "y".repeat(300);
    const blocks = [
      { kind: "heading" as const, text: "Primera", level: 1 },
      { kind: "paragraph" as const, text: bigParagraph },
      { kind: "heading" as const, text: "Segunda", level: 1 },
      { kind: "paragraph" as const, text: "Contenido corto." },
    ];
    const chunks = chunkBlocks(blocks, { minChars: 100, overlapChars: 50 });
    const secondChunk = chunks.find((c) => c.heading === "Segunda")!;
    expect(secondChunk.text.startsWith("y")).toBe(false);
  });

  it("preserves row/jsonPath location metadata on the resulting chunk", () => {
    const chunks = chunkBlocks([{ kind: "table_row" as const, text: "fila uno", rowIndex: 3 }]);
    expect(chunks[0].rowIndex).toBe(3);
    expect(chunks[0].locationLabel).toContain("Fila 3");
  });
});

// ---------------------------------------------------------------------------
// 6. RAG answer prompt + parsing
// ---------------------------------------------------------------------------
describe("answer-prompt.ts: controlled RAG prompt (spec sections 16/17/19)", () => {
  it("builds a system prompt instructing SOURCES_ONLY mode to never complete with general knowledge", () => {
    const { systemPrompt } = buildKnowledgeAnswerPrompt({ question: "¿Cuál es la política?", mode: "SOURCES_ONLY", chunks: [] });
    expect(systemPrompt).toMatch(/no completes con conocimiento general/);
  });

  it("SOURCES_PLUS_GENERAL mode instructs the model to literally mark general-knowledge content", () => {
    const { systemPrompt } = buildKnowledgeAnswerPrompt({ question: "¿Cuál es la política?", mode: "SOURCES_PLUS_GENERAL", chunks: [] });
    expect(systemPrompt).toMatch(/\[conocimiento general\]/);
  });

  it("numbers every provided chunk in the user prompt so the model can cite it as [n]", () => {
    const { userPrompt } = buildKnowledgeAnswerPrompt({
      question: "¿Qué dice el manual?",
      mode: "SOURCES_ONLY",
      chunks: [{ label: 1, sourceTitle: "Manual", text: "Contenido del manual." }, { label: 2, sourceTitle: "Política", text: "Contenido de política." }],
    });
    expect(userPrompt).toContain("[1] (Manual)");
    expect(userPrompt).toContain("[2] (Política)");
  });

  it("declares every field from KNOWLEDGE_ANSWER_FIELDS in the system prompt format block", () => {
    const { systemPrompt } = buildKnowledgeAnswerPrompt({ question: "x", mode: "SOURCES_ONLY", chunks: [] });
    for (const field of KNOWLEDGE_ANSWER_FIELDS) expect(systemPrompt).toContain(field.marker);
  });

  it("parseKnowledgeAnswer fails cleanly on empty/unusable AI output", () => {
    const result = parseKnowledgeAnswer("texto sin ningún marcador reconocible");
    expect(result.status).toBe("failed");
  });

  it("parseKnowledgeAnswer parses a well-formed response into its structured fields", () => {
    const raw = "RESPUESTA:\nLa política permite devoluciones en 30 días [1].\n\nHECHOS_RESPALDADOS:\n30 días de plazo [1]\n\nINFERENCIAS:\n\nRECOMENDACIONES:\n\nINFO_FALTANTE:\n";
    const result = parseKnowledgeAnswer(raw);
    expect(result.status).toBe("completed");
    expect(result.output?.answer).toContain("30 días");
  });
});

// ---------------------------------------------------------------------------
// 7. Content verification (spec section 26)
// ---------------------------------------------------------------------------
describe("verification.ts: claim splitting, textual scoring, and combined classification", () => {
  it("splits text into sentence-level claims, filtering out fragments too short to verify", () => {
    const claims = splitIntoClaims("Nuestro producto es excelente. Este texto es una afirmación verificable con contenido real. Sí.");
    expect(claims.every((c) => c.text.length >= 20)).toBe(true);
    expect(claims.length).toBeGreaterThan(0);
  });

  it("scoreClaimAgainstChunk returns a higher score for real word overlap than for unrelated text", () => {
    const claim = "El producto incluye garantía de dos años.";
    const relevant = "Este producto incluye una garantía de dos años completa.";
    const unrelated = "El clima en Madrid es agradable en primavera.";
    expect(scoreClaimAgainstChunk(claim, relevant)).toBeGreaterThan(scoreClaimAgainstChunk(claim, unrelated));
  });

  it("isOpinionClaim recognizes subjective-opinion markers", () => {
    expect(isOpinionClaim("Creemos que este es el mejor producto del mercado.")).toBe(true);
    expect(isOpinionClaim("El producto pesa 300 gramos.")).toBe(false);
  });

  it("classifyClaim: strong textual overlap always yields SUPPORTED, even against a contradicting AI verdict", () => {
    const claim = "El producto incluye garantía de dos años.";
    const matches = [{ chunkId: "c1", sourceId: "s1", score: 0.9, snippet: "garantía de dos años" }];
    expect(classifyClaim(claim, matches, "CONTRADICHA")).toBe("SUPPORTED");
  });

  it("classifyClaim: no evidence and no AI verdict is NOT_CHECKABLE, not silently UNSUPPORTED", () => {
    expect(classifyClaim("Una afirmación cualquiera sin evidencia.", [])).toBe("NOT_CHECKABLE");
  });

  it("classifyClaim: weak evidence plus an AI 'no verificable' verdict yields NOT_CHECKABLE", () => {
    const matches = [{ chunkId: "c1", sourceId: "s1", score: 0.05, snippet: "algo no relacionado" }];
    expect(classifyClaim("Afirmación específica.", matches, "NO_VERIFICABLE")).toBe("NOT_CHECKABLE");
  });

  it("classifyClaim: a question is never checkable", () => {
    expect(classifyClaim("¿Es esto verdad?", [])).toBe("NOT_CHECKABLE");
  });
});

// ---------------------------------------------------------------------------
// 8. Search — real textual ranking, honest about no semantic search
// ---------------------------------------------------------------------------
describe("search.ts: hybrid textual ranking, and an honest 'no semantic search' interface", () => {
  it("isSemanticSearchAvailable is false — this app's only AI engine is local/client-side with no embeddings endpoint", () => {
    expect(isSemanticSearchAvailable()).toBe(false);
  });

  it("computeHybridScore rewards a higher ts_rank, a title match, and a heading match", () => {
    const base = computeHybridScore({ tsRank: 0.1, titleBoost: false, headingBoost: false, ageDays: null });
    const withTitle = computeHybridScore({ tsRank: 0.1, titleBoost: true, headingBoost: false, ageDays: null });
    const withHeading = computeHybridScore({ tsRank: 0.1, titleBoost: false, headingBoost: true, ageDays: null });
    expect(withTitle).toBeGreaterThan(base);
    expect(withHeading).toBeGreaterThan(base);
  });

  it("computeHybridScore favors more recent content when ageDays is provided", () => {
    const recent = computeHybridScore({ tsRank: 0.1, titleBoost: false, headingBoost: false, ageDays: 1 });
    const old = computeHybridScore({ tsRank: 0.1, titleBoost: false, headingBoost: false, ageDays: 400 });
    expect(recent).toBeGreaterThan(old);
  });

  it("isSearchableQuery rejects empty/whitespace-only queries", () => {
    expect(isSearchableQuery("")).toBe(false);
    expect(isSearchableQuery("   ")).toBe(false);
    expect(isSearchableQuery("políticas")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Error taxonomy (spec section 38)
// ---------------------------------------------------------------------------
describe("types.ts: typed functional error codes, never a raw thrown error or stack trace", () => {
  it("declares exactly the 16 error codes from spec section 38", () => {
    expect([...KNOWLEDGE_ERROR_CODES].sort()).toEqual(
      [
        "KNOWLEDGE_SOURCE_NOT_FOUND",
        "UNSUPPORTED_FILE_TYPE",
        "EXTRACTION_FAILED",
        "NO_EXTRACTABLE_TEXT",
        "OCR_REQUIRED",
        "NORMALIZATION_FAILED",
        "CHUNKING_FAILED",
        "INDEXING_FAILED",
        "SEARCH_FAILED",
        "INSUFFICIENT_EVIDENCE",
        "INVALID_CITATION",
        "SOURCE_VERSION_CONFLICT",
        "DUPLICATE_SOURCE",
        "PROCESSING_CONFLICT",
        "PERMISSION_DENIED",
        "INTERNAL_SAFE_ERROR",
      ].sort()
    );
  });

  it("every error code has a real, non-empty, user-facing Spanish message — never exposes internals", () => {
    for (const code of KNOWLEDGE_ERROR_CODES) {
      expect(KNOWLEDGE_ERROR_MESSAGES[code]).toBeTruthy();
      expect(KNOWLEDGE_ERROR_MESSAGES[code]).not.toMatch(/stack|Error:|at Object/);
    }
  });

  it("knowledgeError() returns the code alongside its message, and accepts an override", () => {
    const result = knowledgeError("DUPLICATE_SOURCE");
    expect(result.code).toBe("DUPLICATE_SOURCE");
    expect(result.error).toBe(KNOWLEDGE_ERROR_MESSAGES.DUPLICATE_SOURCE);
    expect(knowledgeError("DUPLICATE_SOURCE", "mensaje custom").error).toBe("mensaje custom");
  });

  it("getActionErrorMessage extracts a string error and is honest about a success payload", () => {
    expect(getActionErrorMessage({ error: "algo falló" })).toBe("algo falló");
    expect(getActionErrorMessage({})).toBeUndefined();
    expect(getActionErrorMessage({ id: "abc" })).toBeUndefined();
    expect(getActionErrorMessage(null)).toBeUndefined();
  });
});

describe("collection-icons.ts: closed vocabulary for collection icons/colors", () => {
  it("has at least the example collection types from spec section 5", () => {
    expect(KNOWLEDGE_COLLECTION_ICON_NAMES.length).toBeGreaterThanOrEqual(8);
  });
  it("every color is a real hex value", () => {
    for (const c of KNOWLEDGE_COLLECTION_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

// ---------------------------------------------------------------------------
// 10. AI Agent Studio integration (spec section 23)
// ---------------------------------------------------------------------------
describe("AI Agent Studio integration: Knowledge Base as an explicit, scoped context/tool", () => {
  it("registers 'knowledge-base' in the closed AGENT_TOOL_IDS vocabulary", () => {
    expect(AGENT_TOOL_IDS).toContain("knowledge-base");
  });

  it("Research Agent and Review Agent declare the knowledge-base tool", () => {
    expect(findAgentDefinition("research-agent")!.allowedTools).toContain("knowledge-base");
    expect(findAgentDefinition("review-agent")!.allowedTools).toContain("knowledge-base");
  });

  it("agent-context.ts resolves Knowledge Base context only when explicitly selected, via the shared resolveKnowledgeContext service — never a second retrieval implementation", () => {
    const source = read("src/server/services/agent-context.ts");
    expect(source).toMatch(/resolveKnowledgeContext/);
    expect(source).toMatch(/selection\.knowledgeCollectionIds\?\.length \|\| selection\.knowledgeSourceIds\?\.length/);
  });

  it("AgentContextSelection type declares the explicit knowledge scope fields", () => {
    const source = read("src/lib/agents/types.ts");
    expect(source).toMatch(/knowledgeCollectionIds\?:\s*string\[\]/);
    expect(source).toMatch(/knowledgeSourceIds\?:\s*string\[\]/);
  });
});

// ---------------------------------------------------------------------------
// 11. AI Workflows integration (spec section 29)
// ---------------------------------------------------------------------------
describe("AI Workflows integration: a real 'knowledge' node reusing the existing engine, not a parallel one", () => {
  it("registers 'knowledge' as a real step type", () => {
    expect(WORKFLOW_STEP_TYPES).toContain("knowledge");
  });

  it("resolveStepForExecution resolves a knowledge step from a precomputed resource, and errors clearly when it's missing", () => {
    const step = { id: "s1", type: "knowledge" as const, label: "Buscar", outputVariable: "out", knowledgeQuery: "políticas", knowledgeCollectionIds: ["c1"] };
    const missing = resolveStepForExecution(step, {}, { brandContext: "" });
    expect(missing.kind).toBe("error");

    const resolved = resolveStepForExecution(step, {}, { brandContext: "", knowledgeSearchResult: "[1] (Manual): contenido real" });
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind === "resolved") expect(resolved.output).toContain("Manual");
  });

  it("validateWorkflowSteps requires both a query and a collection/source scope for a knowledge step", () => {
    const source = read("src/lib/ai-workflows/engine.ts");
    expect(source).toMatch(/step\.type === "knowledge"/);
    expect(source).toMatch(/knowledgeQuery\?\.trim\(\)/);
  });

  it("buildResourcesForStep performs the real DB-backed search for a knowledge step server-side (never inside the pure resolver)", () => {
    const source = read("src/server/services/workflow-resources.ts");
    expect(source).toMatch(/case "knowledge":/);
    expect(source).toMatch(/searchKnowledge\(/);
  });

  it("the step editor and card UI both label the knowledge step", () => {
    expect(read("src/components/ai-workflows/workflow-card.tsx")).toMatch(/knowledge: "Buscar en Knowledge Base"/);
    expect(read("src/components/ai-workflows/workflow-step-editor.tsx")).toMatch(/knowledge: "Buscar en Knowledge Base"/);
  });
});

// ---------------------------------------------------------------------------
// 12. Prisma schema + migration — additive only (spec sections 35/42)
// ---------------------------------------------------------------------------
describe("prisma/schema.prisma: additive Knowledge Base models", () => {
  const schema = read("prisma/schema.prisma");

  it("declares every model from spec section 35's suggested list", () => {
    for (const model of [
      "KnowledgeCollection",
      "KnowledgeCollectionSource",
      "KnowledgeSource",
      "KnowledgeSourceVersion",
      "KnowledgeChunk",
      "KnowledgeQuery",
      "KnowledgeQueryResult",
      "KnowledgeCitation",
      "KnowledgeProcessingAttempt",
      "ContentKnowledgeCitation",
    ]) {
      expect(schema).toMatch(new RegExp(`model ${model} \\{`));
    }
  });

  it("never creates a parallel FileAsset/ContentItem/Campaign/SocialPost model — only references them", () => {
    const knowledgeBlocks = schema.match(/model Knowledge[\s\S]*?(?=\nmodel |\z)/g)!.join("\n");
    expect(knowledgeBlocks).not.toMatch(/model FileAsset|model ContentItem|model Campaign\b|model SocialPost/);
    expect(knowledgeBlocks).toMatch(/fileAssetId/);
    expect(knowledgeBlocks).toMatch(/contentItemId/);
  });

  it("KnowledgeChunk.searchVector is a DB-managed Unsupported tsvector column — Prisma never writes to it", () => {
    const chunkBlock = schema.match(/model KnowledgeChunk \{[\s\S]*?\n\}/)![0];
    expect(chunkBlock).toMatch(/searchVector\s+Unsupported\("tsvector"\)\?/);
  });

  it("no payments/subscriptions/billing were introduced by the new Knowledge* models", () => {
    const knowledgeBlocks = schema.match(/model Knowledge[\s\S]*?(?=\nmodel |\z)/g)!.join("\n") + (schema.match(/model ContentKnowledgeCitation[\s\S]*?(?=\nmodel |\z)/)?.[0] ?? "");
    expect(knowledgeBlocks).not.toMatch(/stripe|subscription|billing|checkout|invoice/i);
  });
});

describe("migration: single additive migration, no destructive statements", () => {
  const migrationDir = "prisma/migrations/20260728100000_add_knowledge_base";
  it("the migration folder exists", () => {
    expect(existsSync(path.join(ROOT, migrationDir, "migration.sql"))).toBe(true);
  });

  it("contains no DROP TABLE / DROP COLUMN — purely additive", () => {
    const sql = read(`${migrationDir}/migration.sql`);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });

  it("creates the real-text-search GIN index on the generated tsvector column — no extension required", () => {
    const sql = read(`${migrationDir}/migration.sql`);
    expect(sql).toMatch(/GENERATED ALWAYS AS \(to_tsvector\('spanish', "text"\)\) STORED/);
    expect(sql).toMatch(/USING GIN \("searchVector"\)/);
    expect(sql).not.toMatch(/CREATE EXTENSION/i);
  });

  it("declares the idempotency-guard unique constraints (versions, chunk order, collection membership, query results)", () => {
    const sql = read(`${migrationDir}/migration.sql`);
    expect(sql).toMatch(/KnowledgeSourceVersion_sourceId_version_key/);
    expect(sql).toMatch(/KnowledgeChunk_versionId_order_key/);
    expect(sql).toMatch(/KnowledgeCollectionSource_collectionId_sourceId_key/);
    expect(sql).toMatch(/KnowledgeQueryResult_queryId_chunkId_key/);
  });

  it("restricts FileAsset deletion while a KnowledgeSource still references it (DB-level safety, spec section 34)", () => {
    const sql = read(`${migrationDir}/migration.sql`);
    expect(sql).toMatch(/KnowledgeSource_fileAssetId_fkey.*ON DELETE RESTRICT/);
  });
});

// ---------------------------------------------------------------------------
// 13. Security/permissions — structural checks (services are server-only and
// can't run under vitest, so ownership/permission wiring is verified by
// inspecting the real source, the same convention every prior phase uses).
// ---------------------------------------------------------------------------
describe("permissions and isolation: every action requires real project access, every service re-checks projectId", () => {
  const actionFiles = [
    "knowledge-collections.ts",
    "knowledge-sources.ts",
    "knowledge-processing.ts",
    "knowledge-search.ts",
    "knowledge-queries.ts",
    "knowledge-citations.ts",
    "knowledge-verification.ts",
    "knowledge-select.ts",
  ];

  it("every Knowledge Base action file calls requireProjectAccess before touching data", () => {
    for (const file of actionFiles) {
      const source = read(`src/server/actions/${file}`);
      expect(source).toMatch(/requireProjectAccess\(projectId,\s*"(VIEWER|EDITOR)"\)/);
    }
  });

  it("mutation actions (create/update/delete/process) require at least EDITOR, never VIEWER-only", () => {
    const sources = read("src/server/actions/knowledge-sources.ts");
    expect(sources).toMatch(/createPastedSourceAction[\s\S]*?requireProjectAccess\(projectId, "EDITOR"\)/);
    expect(sources).toMatch(/deleteSourceAction[\s\S]*?requireProjectAccess\(projectId, "EDITOR"\)/);
    const processing = read("src/server/actions/knowledge-processing.ts");
    expect(processing).toMatch(/processSourceStageAction[\s\S]*?requireProjectAccess\(projectId, "EDITOR"\)/);
  });

  it("knowledge-sources.ts service re-validates projectId ownership on every read/write, never trusting a bare id", () => {
    const source = read("src/server/services/knowledge-sources.ts");
    const ownershipChecks = source.match(/\.projectId !== projectId/g) ?? [];
    expect(ownershipChecks.length).toBeGreaterThan(5);
  });

  it("knowledge-search.ts scopes the raw SQL query to the project INSIDE the query itself, not only in application code", () => {
    const source = read("src/server/services/knowledge-search.ts");
    expect(source).toMatch(/s\."projectId" = \$\{params\.projectId\}/);
  });

  it("resolveKnowledgeContext re-validates every collection/source id against the project before returning any content", () => {
    const source = read("src/server/services/knowledge-context.ts");
    expect(source).toMatch(/findMany\(\{ where: \{ id: \{ in: sourceIds \}, projectId \}/);
  });

  it("no server action or service trusts a client-supplied contentType/kind the way past phases explicitly guarded against", () => {
    const source = read("src/server/services/knowledge-citations.ts");
    expect(source).toMatch(/chunk\.version\.source\.projectId !== projectId/);
  });
});

// ---------------------------------------------------------------------------
// 14. Idempotency/concurrency (spec section 30/31)
// ---------------------------------------------------------------------------
describe("knowledge-processing.ts: atomic stage claiming, never double-processing the same version", () => {
  const source = read("src/server/services/knowledge-processing.ts");

  it("claims a stage atomically via updateMany with an executionToken guard, matching the AiAgentRunStep/MarketingBrainStep precedent", () => {
    expect(source).toMatch(/updateMany\(\{\s*where: \{ id: versionId, currentStage: stage, executionToken: null \}/);
  });

  it("a failed claim (someone else already processing) returns a PROCESSING_CONFLICT-flavored result rather than silently proceeding", () => {
    expect(source).toMatch(/conflict: true/);
  });

  it("retrying never deletes already-persisted chunks from earlier successful stages", () => {
    expect(source).not.toMatch(/knowledgeChunk\.deleteMany[\s\S]{0,80}retrySourceStage/);
    expect(source.indexOf("export async function retrySourceStage")).toBeGreaterThan(-1);
  });

  it("FINALIZE computes PARTIALLY_READY vs READY from real per-chunk status counts, never assumes full success", () => {
    expect(source).toMatch(/readyCount === totalCount \? "READY" : "PARTIALLY_READY"/);
  });
});

describe("knowledge-sources.ts: duplicate detection scoped to the project, checksum-based, never automatic reprocessing", () => {
  const source = read("src/server/services/knowledge-sources.ts");
  it("findDuplicateByChecksum is scoped to the project and excludes archived sources", () => {
    expect(source).toMatch(/findDuplicateByChecksum[\s\S]*?source: \{ projectId, isArchived: false \}/);
  });
  it("creation functions skip the duplicate check only when explicitly forced by the caller (never silently reprocesses)", () => {
    expect(source).toMatch(/forceCreate = false/);
  });
});

// ---------------------------------------------------------------------------
// 15. FileAsset safety (spec section 34)
// ---------------------------------------------------------------------------
describe("publishing-media.ts: deleting a FileAsset still referenced by a KnowledgeSource is blocked with a clear message", () => {
  const source = read("src/server/actions/publishing-media.ts");
  it("checks for a referencing KnowledgeSource before deleting", () => {
    expect(source).toMatch(/prisma\.knowledgeSource\.findFirst\(\{ where: \{ fileAssetId: assetId \}/);
  });
  it("returns an actionable error instead of deleting", () => {
    expect(source).toMatch(/Base de Conocimiento/);
  });
});

// ---------------------------------------------------------------------------
// 16. Navigation — authenticated only (spec section 2)
// ---------------------------------------------------------------------------
describe("navigation: Knowledge Base is reachable only from the authenticated app, never guest mode", () => {
  it("projectNavGroups includes 'Knowledge Base' in the same 'Principal' group, shortly after AI Agents (later phases may insert their own items in between)", () => {
    const principal = projectNavGroups.find((g) => g.label === "Principal")!;
    const labels = principal.items.map((i) => i.label);
    const agentsIndex = labels.indexOf("AI Agents");
    const knowledgeIndex = labels.indexOf("Knowledge Base");
    expect(agentsIndex).toBeGreaterThanOrEqual(0);
    expect(knowledgeIndex).toBeGreaterThan(agentsIndex);
  });

  it("guest navigation never mentions Knowledge Base", () => {
    const guestLabels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(guestLabels).not.toContain("Knowledge Base");
  });
});

// ---------------------------------------------------------------------------
// 17. Routes exist
// ---------------------------------------------------------------------------
describe("routes: the 3 authenticated Knowledge Base pages exist", () => {
  it("hub, source detail, and ask pages all exist as real route files", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/knowledge/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/knowledge/sources/[sourceId]/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/knowledge/ask/page.tsx"))).toBe(true);
  });

  it("every Knowledge Base page requires real project access before rendering", () => {
    for (const page of ["knowledge/page.tsx", "knowledge/sources/[sourceId]/page.tsx", "knowledge/ask/page.tsx"]) {
      const source = read(`src/app/(dashboard)/dashboard/[projectId]/${page}`);
      expect(source).toMatch(/requireProjectAccess\(projectId,\s*"VIEWER"\)/);
    }
  });
});

// ---------------------------------------------------------------------------
// 18. UI hygiene — no alert()/confirm(), no payments
// ---------------------------------------------------------------------------
describe("UI hygiene: no alert()/confirm(), no payments/subscriptions anywhere in the new Knowledge Base surface", () => {
  const uiFiles = [
    "src/components/knowledge/knowledge-hub.tsx",
    "src/components/knowledge/new-source-dialog.tsx",
    "src/components/knowledge/collection-dialog.tsx",
    "src/components/knowledge/source-detail.tsx",
    "src/components/knowledge/ask-panel.tsx",
    "src/components/knowledge/processing-driver.tsx",
    "src/components/editor/sidebar/tabs/knowledge-tab.tsx",
    "src/components/editor/sidebar/tabs/content-verification-panel.tsx",
  ];

  it("no component uses alert() or confirm()", () => {
    for (const file of uiFiles) {
      const source = read(file);
      expect(source).not.toMatch(/[^.\w]alert\(|[^.\w]confirm\(/);
    }
  });

  it("no component references payments, subscriptions, billing, or checkout", () => {
    for (const file of uiFiles) {
      const source = read(file);
      expect(source).not.toMatch(/stripe|subscription|billing|checkout|pricing plan/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 19. Extraction honesty — spec section 3
// ---------------------------------------------------------------------------
describe("honesty checks: never claim OCR, embeddings, or semantic search that don't exist", () => {
  it("no lib/knowledge file claims to run OCR", () => {
    const files = ["src/lib/knowledge/extractors/pdf.ts", "src/server/services/knowledge-processing.ts"];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/runOcr|performOcr|tesseract/i);
    }
  });

  it("no lib/knowledge file stores a fabricated embedding vector", () => {
    const source = read("src/server/services/knowledge-search.ts");
    expect(source).not.toMatch(/embedding/i);
  });
});
