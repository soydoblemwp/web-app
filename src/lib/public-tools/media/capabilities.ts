/**
 * Format/codec capability matrix (spec section 13). Never infers what's
 * possible from a file extension alone — a container (mp4/webm), a video
 * codec, and an audio codec are tracked as distinct facts.
 *
 * `STATIC_CAPABILITY_MATRIX` reflects the actual, documented encoder set
 * the ffmpeg.wasm project compiles into the exact `@ffmpeg/core@0.12.10`
 * GPL build this app bundles (libmp3lame, libvorbis, libopus, native
 * PCM/WAV, FLAC, libx264, libvpx VP8/VP9, native GIF) — it is a real,
 * version-pinned fact about the shipped binary, not a guess. It is used
 * as the honest DEFAULT before the core has loaded.
 *
 * `detectRuntimeEncoders()` goes further and asks the loaded core itself
 * (`ffmpeg -encoders`) once it's initialized, so the UI reflects what this
 * visitor's actual loaded core supports, not just what the matrix expects
 * (spec: "comprueba los encoders y formatos realmente disponibles").
 */

export type MediaKind = "audio" | "video" | "image";

export interface FormatCapability {
  id: string;
  label: string;
  container: string;
  extension: string;
  mimeType: string;
  kind: MediaKind;
  /** FFmpeg encoder name(s) that must be present for this app to be able to PRODUCE this format. */
  ffmpegEncoders: string[];
  lossless: boolean;
}

export const STATIC_CAPABILITY_MATRIX: FormatCapability[] = [
  { id: "mp3", label: "MP3", container: "mp3", extension: "mp3", mimeType: "audio/mpeg", kind: "audio", ffmpegEncoders: ["libmp3lame"], lossless: false },
  { id: "wav", label: "WAV (PCM)", container: "wav", extension: "wav", mimeType: "audio/wav", kind: "audio", ffmpegEncoders: ["pcm_s16le"], lossless: true },
  { id: "ogg-vorbis", label: "OGG (Vorbis)", container: "ogg", extension: "ogg", mimeType: "audio/ogg", kind: "audio", ffmpegEncoders: ["libvorbis"], lossless: false },
  { id: "opus", label: "Opus", container: "ogg", extension: "opus", mimeType: "audio/ogg", kind: "audio", ffmpegEncoders: ["libopus"], lossless: false },
  { id: "flac", label: "FLAC", container: "flac", extension: "flac", mimeType: "audio/flac", kind: "audio", ffmpegEncoders: ["flac"], lossless: true },
  { id: "mp4-h264", label: "MP4 (H.264)", container: "mp4", extension: "mp4", mimeType: "video/mp4", kind: "video", ffmpegEncoders: ["libx264", "aac"], lossless: false },
  { id: "webm-vp8", label: "WebM (VP8)", container: "webm", extension: "webm", mimeType: "video/webm", kind: "video", ffmpegEncoders: ["libvpx", "libvorbis"], lossless: false },
  { id: "webm-vp9", label: "WebM (VP9)", container: "webm", extension: "webm", mimeType: "video/webm", kind: "video", ffmpegEncoders: ["libvpx-vp9", "libopus"], lossless: false },
  { id: "gif", label: "GIF", container: "gif", extension: "gif", mimeType: "image/gif", kind: "image", ffmpegEncoders: ["gif"], lossless: true },
  { id: "png", label: "PNG", container: "png", extension: "png", mimeType: "image/png", kind: "image", ffmpegEncoders: ["png"], lossless: true },
  { id: "mjpeg", label: "JPEG", container: "jpeg", extension: "jpg", mimeType: "image/jpeg", kind: "image", ffmpegEncoders: ["mjpeg"], lossless: false },
  { id: "webp", label: "WebP", container: "webp", extension: "webp", mimeType: "image/webp", kind: "image", ffmpegEncoders: ["libwebp"], lossless: false },
];

export function getFormatsByKind(kind: MediaKind): FormatCapability[] {
  return STATIC_CAPABILITY_MATRIX.filter((f) => f.kind === kind);
}

/**
 * Parses the human-readable listing FFmpeg prints for `ffmpeg -encoders`
 * (one encoder per line, name in a fixed column) into a set of encoder
 * names — the real per-session source of truth once the core is loaded.
 */
export function parseEncoderListing(logText: string): Set<string> {
  const encoders = new Set<string>();
  const lines = logText.split("\n");
  for (const line of lines) {
    // Encoder lines look like " V..... libx264              libx264 H.264 ..." — capability flags, then the name.
    const match = /^\s*[VAS][F.][S.][X.][B.][D.]\s+(\S+)/.exec(line);
    if (match) encoders.add(match[1]);
  }
  return encoders;
}

/** Filters the static matrix down to formats whose encoder(s) were actually confirmed present by `parseEncoderListing`. Returns the static matrix unfiltered when `detectedEncoders` is null (core not loaded yet) — an honest "expected, not yet confirmed" default. */
export function resolveAvailableFormats(detectedEncoders: Set<string> | null): FormatCapability[] {
  if (!detectedEncoders) return STATIC_CAPABILITY_MATRIX;
  return STATIC_CAPABILITY_MATRIX.filter((format) => format.ffmpegEncoders.every((encoder) => detectedEncoders.has(encoder)));
}

/**
 * Whether THIS browser can actually preview/play a given MIME+codec combo
 * — distinct from whether FFmpeg can produce it (spec section 13: "FFmpeg
 * sí puede procesarlo, pero el navegador no reproducirlo").
 */
export function canBrowserPlay(mimeType: string, kind: "audio" | "video"): boolean {
  if (typeof document === "undefined") return false;
  const element = document.createElement(kind);
  const support = element.canPlayType(mimeType);
  return support === "probably" || support === "maybe";
}

export interface CompatibilityFinding {
  severity: "INFO" | "WARNING";
  message: string;
}

export function describeCompatibility(format: FormatCapability, canPlay: boolean): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  if (!canPlay) {
    findings.push({ severity: "WARNING", message: `Este navegador puede no reproducir una vista previa de ${format.label}, aunque el archivo se genere correctamente. Descárgalo para comprobarlo en otro reproductor.` });
  }
  if (!format.lossless) {
    findings.push({ severity: "INFO", message: `${format.label} usa compresión con pérdida; no es una copia bit a bit del original.` });
  }
  return findings;
}
