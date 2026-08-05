import { msToFfmpegTimestamp } from "./timeline";

/**
 * Every function here returns a plain `string[]` for `ffmpeg.exec()` —
 * never a shell string (spec section 12: "no construyas una cadena de
 * shell"). The only free-form text ever accepted from the visitor is a
 * numeric value (start/end time, width, bitrate...), and every one of
 * those goes through `safeInt`/`safeFloat` below, which throws rather
 * than silently passing through anything that isn't a clean finite
 * number — codecs, filters, and filenames are always chosen from
 * TypeScript enums/allowlists or generated virtual names, never free text
 * from the visitor.
 */

export class UnsafeCommandValueError extends Error {
  constructor(label: string) {
    super(`Valor no seguro para ${label}.`);
    this.name = "UnsafeCommandValueError";
  }
}

function safeInt(value: number, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new UnsafeCommandValueError(label);
  }
  return value;
}

function safeFloat(value: number, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new UnsafeCommandValueError(label);
  }
  return value;
}

/** Allowlisted audio encoders — the only strings ever placed after `-c:a`/`-c:v`. */
export const AUDIO_ENCODERS = { mp3: "libmp3lame", wav: "pcm_s16le", "ogg-vorbis": "libvorbis", opus: "libopus", flac: "flac" } as const;
export type AudioFormatId = keyof typeof AUDIO_ENCODERS;

export const VIDEO_ENCODERS = { "mp4-h264": "libx264", "webm-vp8": "libvpx", "webm-vp9": "libvpx-vp9" } as const;
export type VideoFormatId = keyof typeof VIDEO_ENCODERS;

export interface TrimAudioOptions {
  input: string;
  output: string;
  startMs: number;
  endMs: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  copyCodec: boolean;
  formatId?: AudioFormatId;
}

export function buildTrimAudioCommand(opts: TrimAudioOptions): string[] {
  const start = msToFfmpegTimestamp(safeFloat(opts.startMs, "startMs"));
  const durationMs = safeFloat(opts.endMs - opts.startMs, "duración", 1);
  const durationS = durationMs / 1000;

  const args = ["-i", opts.input, "-ss", start, "-t", String(durationS)];

  const filters: string[] = [];
  if (opts.fadeInMs) filters.push(`afade=t=in:st=0:d=${(safeFloat(opts.fadeInMs, "fadeInMs") / 1000).toFixed(3)}`);
  if (opts.fadeOutMs) {
    const fadeOutStart = Math.max(0, durationS - safeFloat(opts.fadeOutMs, "fadeOutMs") / 1000);
    filters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${(opts.fadeOutMs / 1000).toFixed(3)}`);
  }

  if (filters.length > 0) {
    args.push("-af", filters.join(","));
  }
  if (opts.copyCodec && filters.length === 0) {
    // A real stream copy is only valid when the caller already verified the
    // output container matches the source's own codec (see trimAudio() in
    // audio.ts) — "-c copy" cannot transcode into a different container.
    args.push("-c", "copy");
  } else if (opts.formatId) {
    // Always an explicit encoder — never FFmpeg's implicit per-container
    // default, so the bytes we produce always genuinely match `formatId`.
    args.push("-c:a", AUDIO_ENCODERS[opts.formatId]);
  }

  args.push(opts.output);
  return args;
}

export interface ConcatAudioOptions {
  inputs: string[];
  output: string;
  formatId: AudioFormatId;
  bitrateKbps?: number;
  silenceMsBetween?: number;
  sampleRate?: number;
}

/** Builds a filter_complex concat graph referencing each input strictly by its numeric FFmpeg stream index (0:a, 1:a, ...) — never by a user-supplied name (spec section 20: "no concatene bytes directamente... decodifique o transcodifique cuando sea necesario"). */
export function buildConcatAudioCommand(opts: ConcatAudioOptions): string[] {
  if (opts.inputs.length < 2) throw new UnsafeCommandValueError("cantidad de archivos a unir");
  const args: string[] = [];
  for (const input of opts.inputs) args.push("-i", input);

  const segments: string[] = [];
  let labelIndex = 0;
  const labels: string[] = [];
  opts.inputs.forEach((_, i) => {
    let label = `[${i}:a]`;
    if (opts.sampleRate) {
      const resampled = `r${labelIndex}`;
      segments.push(`${label}aresample=${safeInt(opts.sampleRate!, "sampleRate", 8000, 192000)}[${resampled}]`);
      label = `[${resampled}]`;
      labelIndex++;
    }
    labels.push(label);
  });

  segments.push(`${labels.join("")}concat=n=${safeInt(opts.inputs.length, "n")}:v=0:a=1[joined]`);
  args.push("-filter_complex", segments.join(";"));
  args.push("-map", "[joined]");
  args.push("-c:a", AUDIO_ENCODERS[opts.formatId]);
  if (opts.bitrateKbps) args.push("-b:a", `${safeInt(opts.bitrateKbps, "bitrateKbps", 32, 320)}k`);
  args.push(opts.output);
  return args;
}

export interface ConvertAudioOptions {
  input: string;
  output: string;
  formatId: AudioFormatId;
  bitrateKbps?: number;
  sampleRate?: number;
  channels?: 1 | 2;
  stripMetadata: boolean;
}

export function buildConvertAudioCommand(opts: ConvertAudioOptions): string[] {
  const args = ["-i", opts.input, "-c:a", AUDIO_ENCODERS[opts.formatId]];
  if (opts.bitrateKbps) args.push("-b:a", `${safeInt(opts.bitrateKbps, "bitrateKbps", 32, 320)}k`);
  if (opts.sampleRate) args.push("-ar", String(safeInt(opts.sampleRate, "sampleRate", 8000, 192000)));
  if (opts.channels) args.push("-ac", String(safeInt(opts.channels, "channels", 1, 2)));
  if (opts.stripMetadata) args.push("-map_metadata", "-1");
  args.push(opts.output);
  return args;
}

export interface TrimVideoOptions {
  input: string;
  output: string;
  startMs: number;
  endMs: number;
  mode: "fast" | "precise";
  keepAudio: boolean;
  formatId?: VideoFormatId;
}

export function buildTrimVideoCommand(opts: TrimVideoOptions): string[] {
  const start = msToFfmpegTimestamp(safeFloat(opts.startMs, "startMs"));
  const durationS = safeFloat(opts.endMs - opts.startMs, "duración", 1) / 1000;
  const args = ["-ss", start, "-i", opts.input, "-t", String(durationS)];

  if (opts.mode === "fast") {
    args.push("-c", "copy");
  } else {
    args.push("-c:v", VIDEO_ENCODERS[opts.formatId ?? "mp4-h264"]);
    if (opts.keepAudio) args.push("-c:a", "aac");
  }
  if (!opts.keepAudio) args.push("-an");
  args.push(opts.output);
  return args;
}

export type QualityPreset = "high" | "balanced" | "small";
const CRF_BY_QUALITY: Record<QualityPreset, number> = { high: 20, balanced: 26, small: 32 };

export interface CompressVideoOptions {
  input: string;
  output: string;
  quality: QualityPreset;
  formatId: VideoFormatId;
  maxWidth?: number;
  fps?: number;
  audioBitrateKbps?: number;
  removeAudio: boolean;
}

export function buildCompressVideoCommand(opts: CompressVideoOptions): string[] {
  const args = ["-i", opts.input, "-c:v", VIDEO_ENCODERS[opts.formatId]];
  const isVpx = opts.formatId !== "mp4-h264";
  args.push(isVpx ? "-crf" : "-crf", String(safeInt(CRF_BY_QUALITY[opts.quality], "crf", 0, 51)));
  if (!isVpx) args.push("-preset", "medium");
  else args.push("-b:v", "0");

  const filters: string[] = [];
  if (opts.maxWidth) filters.push(`scale='min(${safeInt(opts.maxWidth, "maxWidth", 16, 7680)},iw)':-2`);
  if (filters.length > 0) args.push("-vf", filters.join(","));
  if (opts.fps) args.push("-r", String(safeInt(opts.fps, "fps", 1, 60)));

  if (opts.removeAudio) {
    args.push("-an");
  } else {
    args.push("-c:a", opts.formatId === "mp4-h264" ? "aac" : "libopus");
    if (opts.audioBitrateKbps) args.push("-b:a", `${safeInt(opts.audioBitrateKbps, "audioBitrateKbps", 32, 320)}k`);
  }
  args.push(opts.output);
  return args;
}

export type ResizeFit = "contain" | "cover" | "crop";

export interface ResizeVideoOptions {
  input: string;
  output: string;
  width: number;
  height: number;
  fit: ResizeFit;
  formatId: VideoFormatId;
  fps?: number;
}

/** Never deforms content — every fit mode scales uniformly (spec section 24: "no deformes el contenido; no fuerces ancho y alto ignorando la proporción"). */
export function buildResizeVideoCommand(opts: ResizeVideoOptions): string[] {
  const w = safeInt(opts.width, "width", 2, 7680);
  const h = safeInt(opts.height, "height", 2, 4320);
  let filter: string;
  if (opts.fit === "contain") {
    filter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
  } else if (opts.fit === "cover") {
    filter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  } else {
    filter = `crop=${w}:${h}`;
  }
  const args = ["-i", opts.input, "-vf", filter, "-c:v", VIDEO_ENCODERS[opts.formatId]];
  if (opts.fps) args.push("-r", String(safeInt(opts.fps, "fps", 1, 60)));
  args.push("-c:a", "copy");
  args.push(opts.output);
  return args;
}

export interface ExtractAudioOptions {
  input: string;
  output: string;
  startMs?: number;
  endMs?: number;
  copy: boolean;
  formatId: AudioFormatId;
  bitrateKbps?: number;
}

export function buildExtractAudioCommand(opts: ExtractAudioOptions): string[] {
  const args = ["-i", opts.input];
  if (opts.startMs !== undefined && opts.endMs !== undefined) {
    args.push("-ss", msToFfmpegTimestamp(safeFloat(opts.startMs, "startMs")));
    args.push("-t", String(safeFloat(opts.endMs - opts.startMs, "duración", 1) / 1000));
  }
  args.push("-vn");
  if (opts.copy) {
    args.push("-c:a", "copy");
  } else {
    args.push("-c:a", AUDIO_ENCODERS[opts.formatId]);
    if (opts.bitrateKbps) args.push("-b:a", `${safeInt(opts.bitrateKbps, "bitrateKbps", 32, 320)}k`);
  }
  args.push(opts.output);
  return args;
}

export interface GifOptions {
  input: string;
  paletteOutput: string;
  output: string;
  startMs: number;
  endMs: number;
  fps: number;
  width: number;
  loop: boolean;
}

export function buildGifPaletteCommand(opts: GifOptions): string[] {
  const start = msToFfmpegTimestamp(safeFloat(opts.startMs, "startMs"));
  const durationS = safeFloat(opts.endMs - opts.startMs, "duración", 1) / 1000;
  const fps = safeInt(opts.fps, "fps", 1, 30);
  const width = safeInt(opts.width, "width", 16, 800);
  return ["-ss", start, "-t", String(durationS), "-i", opts.input, "-vf", `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`, opts.paletteOutput];
}

export function buildGifApplyCommand(opts: GifOptions): string[] {
  const start = msToFfmpegTimestamp(safeFloat(opts.startMs, "startMs"));
  const durationS = safeFloat(opts.endMs - opts.startMs, "duración", 1) / 1000;
  const fps = safeInt(opts.fps, "fps", 1, 30);
  const width = safeInt(opts.width, "width", 16, 800);
  return [
    "-ss",
    start,
    "-t",
    String(durationS),
    "-i",
    opts.input,
    "-i",
    opts.paletteOutput,
    "-filter_complex",
    `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
    "-loop",
    opts.loop ? "0" : "-1",
    opts.output,
  ];
}

export type FrameExtractionMode = "single" | "multiple" | "interval" | "count" | "thumbnail" | "grid";

export interface ExtractFramesOptions {
  input: string;
  outputPattern: string;
  mode: FrameExtractionMode;
  timeMs?: number;
  intervalSeconds?: number;
  count?: number;
  durationMs?: number;
  format: "png" | "mjpeg" | "webp";
  quality?: number;
}

export function buildExtractFramesCommand(opts: ExtractFramesOptions): string[] {
  const args = ["-i", opts.input];

  if (opts.mode === "single" || opts.mode === "thumbnail") {
    const timeMs = opts.mode === "thumbnail" ? safeFloat((opts.durationMs ?? 0) / 2, "punto medio") : safeFloat(opts.timeMs ?? 0, "timeMs");
    args.push("-ss", msToFfmpegTimestamp(timeMs), "-frames:v", "1");
  } else if (opts.mode === "interval") {
    const interval = safeFloat(opts.intervalSeconds ?? 1, "intervalSeconds", 0.1);
    args.push("-vf", `fps=1/${interval}`);
  } else if (opts.mode === "count") {
    const count = safeInt(opts.count ?? 1, "count", 1, 500);
    const duration = safeFloat(opts.durationMs ?? 1000, "durationMs", 1) / 1000;
    args.push("-vf", `fps=${(count / duration).toFixed(6)}`, "-frames:v", String(count));
  }

  if (opts.format === "mjpeg" && opts.quality) args.push("-q:v", String(safeInt(opts.quality, "quality", 1, 31)));
  args.push(opts.outputPattern);
  return args;
}
