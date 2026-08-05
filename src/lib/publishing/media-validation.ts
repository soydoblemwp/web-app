export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024; // 250 MB
export const MAX_VIDEO_DURATION_SECONDS = 60 * 15; // 15 min — generous ceiling, platform-specific limits are enforced separately at composer level.

export interface MediaValidationInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number | null;
}

export interface MediaValidationResult {
  valid: boolean;
  kind: "IMAGE" | "VIDEO" | null;
  errors: string[];
}

function extensionOf(filename: string): string {
  const match = /\.[a-z0-9]+$/i.exec(filename);
  return match ? match[0].toLowerCase() : "";
}

/** Pure, deterministic — every upload path (composer, media library) runs through this exact function before any bytes touch storage. */
export function validateMediaFile(input: MediaValidationInput): MediaValidationResult {
  const errors: string[] = [];
  const isImage = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(input.mimeType);
  const isVideo = (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(input.mimeType);
  const kind: "IMAGE" | "VIDEO" | null = isImage ? "IMAGE" : isVideo ? "VIDEO" : null;

  if (!kind) {
    errors.push(`Tipo de archivo no permitido: ${input.mimeType || "desconocido"}.`);
    return { valid: false, kind: null, errors };
  }

  const allowedExtensions = MIME_TO_EXTENSIONS[input.mimeType] ?? [];
  const actualExtension = extensionOf(input.filename);
  if (!allowedExtensions.includes(actualExtension)) {
    errors.push(`La extensión "${actualExtension || "(ninguna)"}" no coincide con el tipo ${input.mimeType}.`);
  }

  if (input.sizeBytes <= 0) {
    errors.push("El archivo está vacío.");
  } else if (kind === "IMAGE" && input.sizeBytes > MAX_IMAGE_BYTES) {
    errors.push(`La imagen supera el máximo de ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
  } else if (kind === "VIDEO" && input.sizeBytes > MAX_VIDEO_BYTES) {
    errors.push(`El video supera el máximo de ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`);
  }

  if (kind === "VIDEO" && input.durationSeconds != null && input.durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
    errors.push(`El video supera la duración máxima de ${Math.round(MAX_VIDEO_DURATION_SECONDS / 60)} minutos.`);
  }

  return { valid: errors.length === 0, kind, errors };
}
