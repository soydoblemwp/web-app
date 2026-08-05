/**
 * Shared, framework-free types for AI Knowledge Base & Document
 * Intelligence (Fase 32). Mirrors the Prisma enum value lists in
 * prisma/schema.prisma exactly (kept as plain string unions here so pure
 * lib functions never need to import the generated Prisma client) — same
 * convention as src/lib/agents/types.ts and src/lib/marketing-brain/types.ts.
 */

export const KNOWLEDGE_SOURCE_ORIGIN_TYPES = [
  "PASTED_TEXT",
  "FILE",
  "CONTENT_ITEM",
  "CAMPAIGN",
  "CAMPAIGN_STRATEGY",
  "CAMPAIGN_CONTENT_PIECE",
  "SOCIAL_POST",
  "SAVED_PROMPT",
  "NOTE",
] as const;
export type KnowledgeSourceOriginType = (typeof KNOWLEDGE_SOURCE_ORIGIN_TYPES)[number];

/** Formats this phase genuinely extracts real text from — never claim support beyond this list (spec section 3). */
export const KNOWLEDGE_SOURCE_FORMATS = ["TEXT", "MARKDOWN", "CSV", "JSON", "PDF", "DOCX", "HTML"] as const;
export type KnowledgeSourceFormat = (typeof KNOWLEDGE_SOURCE_FORMATS)[number];

export const KNOWLEDGE_SOURCE_STATUSES = [
  "DRAFT",
  "QUEUED",
  "EXTRACTING",
  "NORMALIZING",
  "CHUNKING",
  "INDEXING",
  "READY",
  "PARTIALLY_READY",
  "FAILED",
  "NEEDS_OCR",
  "ARCHIVED",
] as const;
export type KnowledgeSourceStatusValue = (typeof KNOWLEDGE_SOURCE_STATUSES)[number];

export const KNOWLEDGE_SOURCE_SYNC_MODES = ["MANUAL", "ON_SAVE", "DISABLED"] as const;
export type KnowledgeSourceSyncMode = (typeof KNOWLEDGE_SOURCE_SYNC_MODES)[number];

export const KNOWLEDGE_EXTRACTION_QUALITIES = ["HIGH", "MEDIUM", "LOW", "NONE"] as const;
export type KnowledgeExtractionQuality = (typeof KNOWLEDGE_EXTRACTION_QUALITIES)[number];

export const KNOWLEDGE_CHUNK_STATUSES = ["PENDING", "READY", "FAILED", "ARCHIVED"] as const;
export type KnowledgeChunkStatusValue = (typeof KNOWLEDGE_CHUNK_STATUSES)[number];

export const KNOWLEDGE_PROCESSING_STAGES = ["REGISTER", "EXTRACT", "NORMALIZE", "CHUNK", "INDEX", "FINALIZE"] as const;
export type KnowledgeProcessingStage = (typeof KNOWLEDGE_PROCESSING_STAGES)[number];

export const KNOWLEDGE_QUERY_MODES = ["SOURCES_ONLY", "SOURCES_PLUS_GENERAL"] as const;
export type KnowledgeQueryMode = (typeof KNOWLEDGE_QUERY_MODES)[number];

export const KNOWLEDGE_CITATION_TYPES = ["DIRECT", "CONTEXTUAL"] as const;
export type KnowledgeCitationType = (typeof KNOWLEDGE_CITATION_TYPES)[number];

export type KnowledgeErrorCategoryValue =
  | "VALIDATION"
  | "PERMISSION"
  | "EXTRACTION"
  | "NORMALIZATION"
  | "CHUNKING"
  | "INDEXING"
  | "SEARCH"
  | "CONFLICT"
  | "AI"
  | "INTERNAL_SAFE";

/**
 * Functional, typed error codes (spec section 38) — richer/UI-facing than
 * the small persisted KnowledgeErrorCategory DB enum above. Every service
 * function that can fail returns one of these, never a raw thrown error or
 * a stack trace.
 */
export const KNOWLEDGE_ERROR_CODES = [
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
] as const;
export type KnowledgeErrorCode = (typeof KNOWLEDGE_ERROR_CODES)[number];

export const KNOWLEDGE_ERROR_MESSAGES: Record<KnowledgeErrorCode, string> = {
  KNOWLEDGE_SOURCE_NOT_FOUND: "No se encontró la fuente indicada.",
  UNSUPPORTED_FILE_TYPE: "Este tipo de archivo no está soportado todavía.",
  EXTRACTION_FAILED: "No se pudo extraer el texto de este documento.",
  NO_EXTRACTABLE_TEXT: "El documento no contiene texto extraíble.",
  OCR_REQUIRED: "Este documento parece ser una imagen o un PDF escaneado y requiere OCR, que esta fase no ejecuta automáticamente.",
  NORMALIZATION_FAILED: "No se pudo normalizar el contenido extraído.",
  CHUNKING_FAILED: "No se pudo dividir el contenido en fragmentos.",
  INDEXING_FAILED: "No se pudo indexar el contenido para búsqueda.",
  SEARCH_FAILED: "La búsqueda no se pudo completar. Intenta de nuevo.",
  INSUFFICIENT_EVIDENCE: "La base de conocimiento no contiene evidencia suficiente para responder con confianza.",
  INVALID_CITATION: "Esta cita ya no corresponde a un fragmento válido.",
  SOURCE_VERSION_CONFLICT: "Esta fuente ya tiene una versión más reciente. Actualiza la página e inténtalo de nuevo.",
  DUPLICATE_SOURCE: "Ya existe una fuente idéntica en este proyecto.",
  PROCESSING_CONFLICT: "Esta fuente ya se está procesando en otra solicitud.",
  PERMISSION_DENIED: "No tienes permiso para realizar esta acción.",
  INTERNAL_SAFE_ERROR: "Ocurrió un error inesperado. Intenta de nuevo.",
};

export interface KnowledgeActionError {
  error: string;
  code: KnowledgeErrorCode;
}

export function knowledgeError(code: KnowledgeErrorCode, overrideMessage?: string): KnowledgeActionError {
  return { error: overrideMessage ?? KNOWLEDGE_ERROR_MESSAGES[code], code };
}

// ---------------------------------------------------------------------------
// Extraction — the common shape every format-specific extractor returns.
// ---------------------------------------------------------------------------

export type ExtractedBlockKind = "heading" | "paragraph" | "list_item" | "table_row" | "code" | "other";

export interface ExtractedBlock {
  kind: ExtractedBlockKind;
  text: string;
  /** 1-based heading level (h1=1..h6=6), only for kind "heading". */
  level?: number;
  /** 1-based page number, when the format has real pages (PDF). */
  page?: number;
  /** Nearest enclosing heading text at the time this block was produced. */
  heading?: string;
  /** 1-based row number, for CSV rows. */
  rowIndex?: number;
  /** Dot/bracket JSON path, for JSON values. */
  jsonPath?: string;
}

export interface ExtractionResult {
  ok: boolean;
  text: string;
  blocks: ExtractedBlock[];
  title?: string;
  author?: string;
  detectedLanguage?: string;
  pageCount?: number;
  sectionCount?: number;
  warnings: string[];
  quality: KnowledgeExtractionQuality;
  method: string;
  /** Safe metadata only — never secrets (spec section 7). */
  metadata: Record<string, string | number | boolean>;
  /** Set when extraction succeeded structurally but yielded no usable text (e.g. scanned PDF) — caller must route to NEEDS_OCR, never fabricate content. */
  needsOcr?: boolean;
  errorCode?: KnowledgeErrorCode;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export interface ChunkDraft {
  order: number;
  text: string;
  title?: string;
  heading?: string;
  page?: number;
  section?: string;
  rowIndex?: number;
  jsonPath?: string;
  locationLabel?: string;
  charStart: number;
  charEnd: number;
  checksum: string;
  sizeChars: number;
  tokenEstimate: number;
}

export interface ChunkingOptions {
  /** Target chunk size in characters before a char-limit flush kicks in. */
  maxChars?: number;
  /** Character overlap carried into the next chunk ONLY on a char-limit flush (never on a natural-boundary flush). */
  overlapChars?: number;
  /** Minimum chunk size before a natural boundary (heading/page) is allowed to force a flush — avoids over-fragmenting tiny sections. */
  minChars?: number;
}
