import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";
import { ACCEPTED_AUDIO_MIMES, ACCEPTED_VIDEO_MIMES, MEDIA_LIMITS } from "./limits";
import { sniffMediaContainer, extensionMatchesContainer } from "./mime";

export interface MediaValidationResult {
  ok: boolean;
  error?: FileErrorResult;
  warning?: string;
}

async function readHeaderBytes(file: File, length = 32): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Validates an audio File: non-empty, within the size limit, MIME within
 * the accepted list OR a real magic-byte sniff that resolves to a known
 * audio container (browsers report inconsistent `type` values for some
 * audio files, so the sniff is a real fallback, not decoration).
 */
export async function validateAudioFile(file: File): Promise<MediaValidationResult> {
  if (file.size === 0) return { ok: false, error: buildFileError("empty-file") };
  if (file.size > MEDIA_LIMITS.audio.maxFileBytes) {
    return { ok: false, error: buildFileError("too-large", `El audio supera el límite de ${Math.round(MEDIA_LIMITS.audio.maxFileBytes / (1024 * 1024))} MB.`) };
  }

  const header = await readHeaderBytes(file);
  const sniffed = sniffMediaContainer(header);
  const mimeAccepted = ACCEPTED_AUDIO_MIMES.includes(file.type as (typeof ACCEPTED_AUDIO_MIMES)[number]);
  const sniffAccepted = sniffed !== "unknown" && sniffed !== "mp4" ? true : sniffed === "mp4"; // mp4 container is shared by audio (m4a) and video

  if (!mimeAccepted && !sniffAccepted) {
    return { ok: false, error: buildFileError("invalid-type", "El archivo no parece ser un audio compatible (ni su tipo ni su contenido lo confirman).") };
  }

  let warning: string | undefined;
  if (sniffed !== "unknown" && !extensionMatchesContainer(file.name, sniffed)) {
    warning = "La extensión del archivo no coincide con su contenido real; se procesará según el contenido detectado.";
  }

  return { ok: true, warning };
}

export async function validateVideoFile(file: File): Promise<MediaValidationResult> {
  if (file.size === 0) return { ok: false, error: buildFileError("empty-file") };
  if (file.size > MEDIA_LIMITS.video.maxFileBytes) {
    return { ok: false, error: buildFileError("too-large", `El video supera el límite de ${Math.round(MEDIA_LIMITS.video.maxFileBytes / (1024 * 1024))} MB.`) };
  }

  const header = await readHeaderBytes(file);
  const sniffed = sniffMediaContainer(header);
  const mimeAccepted = ACCEPTED_VIDEO_MIMES.includes(file.type as (typeof ACCEPTED_VIDEO_MIMES)[number]);
  const sniffAccepted = sniffed === "mp4" || sniffed === "webm-mkv" || sniffed === "avi" || sniffed === "ogg";

  if (!mimeAccepted && !sniffAccepted) {
    return { ok: false, error: buildFileError("invalid-type", "El archivo no parece ser un video compatible (ni su tipo ni su contenido lo confirman).") };
  }

  let warning: string | undefined;
  if (sniffed !== "unknown" && !extensionMatchesContainer(file.name, sniffed)) {
    warning = "La extensión del archivo no coincide con su contenido real; se procesará según el contenido detectado.";
  }

  return { ok: true, warning };
}

export function validateResolution(width: number, height: number): MediaValidationResult {
  if (width > MEDIA_LIMITS.video.maxWidth || height > MEDIA_LIMITS.video.maxHeight) {
    return { ok: false, error: buildFileError("limit-exceeded", `La resolución supera el límite de ${MEDIA_LIMITS.video.maxWidth}×${MEDIA_LIMITS.video.maxHeight}.`) };
  }
  if (width * height > MEDIA_LIMITS.video.maxTotalPixelsPerFrame) {
    return { ok: false, error: buildFileError("limit-exceeded", "La resolución supera el límite de píxeles por fotograma admitido.") };
  }
  return { ok: true };
}

export function validateDuration(durationSeconds: number, maxSeconds: number): MediaValidationResult {
  if (durationSeconds > maxSeconds) {
    return { ok: false, error: buildFileError("limit-exceeded", `La duración supera el límite de ${Math.round(maxSeconds / 60)} minutos.`) };
  }
  return { ok: true };
}
