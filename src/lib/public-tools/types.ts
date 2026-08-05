export type PublicToolCategory =
  | "texto"
  | "seo"
  | "redes-sociales"
  | "imagenes"
  | "marketing"
  | "productividad"
  | "pdf-documentos"
  | "privacidad"
  | "diseno-web"
  | "seguridad"
  | "desarrollo"
  | "conversores"
  | "calculadoras"
  | "accesibilidad"
  | "negocios"
  | "seo-tecnico"
  | "audio"
  | "video"
  | "subtitulos"
  | "grabacion"
  | "finanzas"
  | "tiempo"
  | "generadores"
  | "educacion"
  | "comparacion"
  | "empleo"
  | "organizacion"
  | "imprimibles"
  | "cocina"
  | "hogar"
  | "viajes"
  | "redes";

/**
 * `LOCAL_MEDIA` and `LOCAL_RECORDING` (Fase 45) are still fully local/
 * non-AI executions, distinguished from `DETERMINISTIC` only because their
 * processing model is different enough to warrant their own badge copy:
 * `LOCAL_MEDIA` runs FFmpeg WebAssembly in-browser (audio/video/GIF/frame
 * tools), `LOCAL_RECORDING` drives native `MediaRecorder`/`getUserMedia`/
 * `getDisplayMedia` (voice/screen recorders). Neither is ever AI.
 */
export type PublicToolExecutionType = "LOCAL_AI" | "DETERMINISTIC" | "HYBRID" | "LOCAL_MEDIA" | "LOCAL_RECORDING";

export interface PublicToolFaqEntry {
  question: string;
  answer: string;
}

export interface PublicToolDefinition {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  category: PublicToolCategory;
  /** lucide-react icon component name, resolved by the UI layer — kept as a string so the registry stays plain data. */
  icon: string;
  keywords: string[];
  executionType: PublicToolExecutionType;
  requiresLocalAI: boolean;
  supportsGuest: boolean;
  featured: boolean;
  status: "available";
  relatedTools: string[];
  metadata: {
    title: string;
    description: string;
  };
  faq: PublicToolFaqEntry[];
  schemaType: "WebApplication" | "SoftwareApplication";
  /** Short, honest use-case bullets shown on the tool page ("Casos de uso"). */
  useCases: string[];
  /** Short "cómo utilizar" steps shown on the tool page. */
  howToUse: string[];
  /** Where processing happens — every Fase 42 tool is "device-only"; kept as a field (not hardcoded string) so the layout/FAQ/structured-data can state it consistently. */
  privacy: "device-only" | "device-only-with-local-ai";
  /** MIME types this tool accepts, or null for tools with no file upload at all (e.g. pure-text tools). */
  acceptedFileTypes: string[] | null;
  /** Human-readable limit summary shown in the UI (e.g. "hasta 25 MB por archivo") — sourced from src/lib/public-tools/files/limits.ts, never a second hardcoded number. */
  limitsSummary: string | null;
  /** True for tools added in Fase 42 (or any later phase) — drives the "Nueva" badge in the center/homepage. */
  isNew: boolean;
}

export interface PublicToolCategoryDefinition {
  slug: PublicToolCategory;
  label: string;
  description: string;
}
