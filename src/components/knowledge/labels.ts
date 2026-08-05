export const SOURCE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  QUEUED: "En cola",
  EXTRACTING: "Extrayendo texto",
  NORMALIZING: "Normalizando",
  CHUNKING: "Dividiendo en fragmentos",
  INDEXING: "Indexando",
  READY: "Lista",
  PARTIALLY_READY: "Parcialmente lista",
  FAILED: "Con error",
  NEEDS_OCR: "Requiere OCR",
  ARCHIVED: "Archivada",
};

export const SOURCE_FORMAT_LABELS: Record<string, string> = {
  TEXT: "Texto",
  MARKDOWN: "Markdown",
  CSV: "CSV",
  JSON: "JSON",
  PDF: "PDF",
  DOCX: "DOCX",
  HTML: "HTML",
};

export const ORIGIN_TYPE_LABELS: Record<string, string> = {
  PASTED_TEXT: "Texto pegado",
  FILE: "Archivo",
  CONTENT_ITEM: "Contenido",
  CAMPAIGN: "Campaña",
  CAMPAIGN_STRATEGY: "Estrategia de campaña",
  CAMPAIGN_CONTENT_PIECE: "Pieza de campaña",
  SOCIAL_POST: "Publicación",
  SAVED_PROMPT: "Prompt guardado",
  NOTE: "Nota",
};

export const PROCESSING_STAGE_LABELS: Record<string, string> = {
  REGISTER: "Registro",
  EXTRACT: "Extracción",
  NORMALIZE: "Normalización",
  CHUNK: "Fragmentación",
  INDEX: "Indexación",
  FINALIZE: "Finalización",
};

export function isTerminalSourceStatus(status: string): boolean {
  return ["READY", "PARTIALLY_READY", "FAILED", "NEEDS_OCR", "ARCHIVED"].includes(status);
}

export function isProcessingSourceStatus(status: string): boolean {
  return ["QUEUED", "EXTRACTING", "NORMALIZING", "CHUNKING", "INDEXING"].includes(status);
}

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  SUPPORTED: "Respaldada",
  PARTIALLY_SUPPORTED: "Parcialmente respaldada",
  UNSUPPORTED: "Sin respaldo",
  CONTRADICTED: "Contradicha",
  OPINION: "Opinión",
  NOT_CHECKABLE: "No verificable",
};
