/**
 * Categorized, honest error reasons shared by every file tool — never a bare
 * "algo salió mal" (spec section 29), and never a raw stack trace shown to
 * the visitor.
 */
export type FileErrorCategory =
  | "invalid-type"
  | "invalid-extension"
  | "too-large"
  | "too-many-files"
  | "empty-file"
  | "corrupted"
  | "encrypted"
  | "unsupported"
  | "limit-exceeded"
  | "cancelled"
  | "unsupported-codec"
  | "no-audio-track"
  | "permission-denied"
  | "device-unavailable"
  | "ffmpeg-load-failed";

export interface FileErrorResult {
  category: FileErrorCategory;
  message: string;
}

const CATEGORY_MESSAGES: Record<FileErrorCategory, string> = {
  "invalid-type": "El archivo no es del tipo esperado.",
  "invalid-extension": "La extensión del archivo no coincide con su contenido.",
  "too-large": "El archivo supera el tamaño máximo permitido.",
  "too-many-files": "Se seleccionaron demasiados archivos a la vez.",
  "empty-file": "El archivo está vacío.",
  corrupted: "El archivo parece estar dañado o no es un documento válido.",
  encrypted: "El archivo está cifrado o protegido y esta herramienta no puede procesarlo.",
  unsupported: "Este formato no es compatible con esta herramienta.",
  "limit-exceeded": "Se superó un límite de esta herramienta.",
  cancelled: "La operación se canceló.",
  "unsupported-codec": "El códec necesario no está disponible en este navegador.",
  "no-audio-track": "El archivo no contiene ninguna pista de audio.",
  "permission-denied": "No se concedió el permiso solicitado.",
  "device-unavailable": "No se encontró un dispositivo compatible (micrófono o pantalla).",
  "ffmpeg-load-failed": "No se pudo cargar el motor de procesamiento multimedia en este navegador.",
};

export function buildFileError(category: FileErrorCategory, detail?: string): FileErrorResult {
  return { category, message: detail ?? CATEGORY_MESSAGES[category] };
}
