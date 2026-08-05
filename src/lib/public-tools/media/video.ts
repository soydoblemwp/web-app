import { ensureFfmpegLoaded, runFfmpegJob } from "./ffmpeg-client";
import { writeInputFile, readOutputFile, cleanupVirtualFiles, generateVirtualName } from "./ffmpeg-filesystem";
import {
  buildTrimVideoCommand,
  buildCompressVideoCommand,
  buildResizeVideoCommand,
  buildExtractAudioCommand,
  buildGifPaletteCommand,
  buildGifApplyCommand,
  buildExtractFramesCommand,
  type VideoFormatId,
  type AudioFormatId,
  type QualityPreset,
  type ResizeFit,
  type FrameExtractionMode,
} from "./ffmpeg-commands";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";
import type { MediaJobResult } from "./audio";

const VIDEO_EXTENSION_BY_FORMAT: Record<VideoFormatId, string> = { "mp4-h264": "mp4", "webm-vp8": "webm", "webm-vp9": "webm" };

export interface TrimVideoInput {
  bytes: Uint8Array;
  extension: string;
  startMs: number;
  endMs: number;
  mode: "fast" | "precise";
  keepAudio: boolean;
  formatId?: VideoFormatId;
}

export async function trimVideo(input: TrimVideoInput): Promise<MediaJobResult> {
  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputName = await writeInputFile(load.ffmpeg, input.bytes, input.extension);
  const outputExt = input.mode === "fast" ? input.extension : VIDEO_EXTENSION_BY_FORMAT[input.formatId ?? "mp4-h264"];
  const outputName = generateVirtualName("output", outputExt);

  try {
    const command = buildTrimVideoCommand({ input: inputName, output: outputName, startMs: input.startMs, endMs: input.endMs, mode: input.mode, keepAudio: input.keepAudio, formatId: input.formatId });
    const result = await runFfmpegJob(command);
    if (!result.ok) return { ok: false, error: result.error };
    const bytes = await readOutputFile(load.ffmpeg, outputName);
    if (bytes.length === 0) return { ok: false, error: buildFileError("corrupted", "El resultado quedó vacío.") };
    return { ok: true, bytes };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, [inputName, outputName]);
  }
}

export interface CompressVideoInput {
  bytes: Uint8Array;
  extension: string;
  quality: QualityPreset;
  formatId: VideoFormatId;
  maxWidth?: number;
  fps?: number;
  audioBitrateKbps?: number;
  removeAudio: boolean;
  originalSizeBytes: number;
}

export interface CompressVideoResult extends MediaJobResult {
  finalSizeBytes?: number;
  reductionPercent?: number;
  increasedInSize?: boolean;
}

export async function compressVideo(input: CompressVideoInput): Promise<CompressVideoResult> {
  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputName = await writeInputFile(load.ffmpeg, input.bytes, input.extension);
  const outputName = generateVirtualName("output", VIDEO_EXTENSION_BY_FORMAT[input.formatId]);

  try {
    const command = buildCompressVideoCommand({
      input: inputName,
      output: outputName,
      quality: input.quality,
      formatId: input.formatId,
      maxWidth: input.maxWidth,
      fps: input.fps,
      audioBitrateKbps: input.audioBitrateKbps,
      removeAudio: input.removeAudio,
    });
    const result = await runFfmpegJob(command);
    if (!result.ok) return { ok: false, error: result.error };
    const bytes = await readOutputFile(load.ffmpeg, outputName);
    if (bytes.length === 0) return { ok: false, error: buildFileError("corrupted", "El resultado quedó vacío.") };
    const finalSizeBytes = bytes.length;
    const reductionPercent = Math.round((1 - finalSizeBytes / input.originalSizeBytes) * 1000) / 10;
    return { ok: true, bytes, finalSizeBytes, reductionPercent, increasedInSize: finalSizeBytes > input.originalSizeBytes };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, [inputName, outputName]);
  }
}

export interface ResizeVideoInput {
  bytes: Uint8Array;
  extension: string;
  width: number;
  height: number;
  fit: ResizeFit;
  formatId: VideoFormatId;
  fps?: number;
}

export async function resizeVideo(input: ResizeVideoInput): Promise<MediaJobResult> {
  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputName = await writeInputFile(load.ffmpeg, input.bytes, input.extension);
  const outputName = generateVirtualName("output", VIDEO_EXTENSION_BY_FORMAT[input.formatId]);

  try {
    const command = buildResizeVideoCommand({ input: inputName, output: outputName, width: input.width, height: input.height, fit: input.fit, formatId: input.formatId, fps: input.fps });
    const result = await runFfmpegJob(command);
    if (!result.ok) return { ok: false, error: result.error };
    const bytes = await readOutputFile(load.ffmpeg, outputName);
    if (bytes.length === 0) return { ok: false, error: buildFileError("corrupted", "El resultado quedó vacío.") };
    return { ok: true, bytes };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, [inputName, outputName]);
  }
}

export interface ExtractAudioFromVideoInput {
  bytes: Uint8Array;
  extension: string;
  startMs?: number;
  endMs?: number;
  hasAudioTrack: boolean;
  copy: boolean;
  formatId: AudioFormatId;
  bitrateKbps?: number;
}

export async function extractAudioFromVideo(input: ExtractAudioFromVideoInput): Promise<MediaJobResult> {
  if (!input.hasAudioTrack) return { ok: false, error: buildFileError("no-audio-track") };

  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputName = await writeInputFile(load.ffmpeg, input.bytes, input.extension);
  const outputName = generateVirtualName("output", input.formatId === "ogg-vorbis" ? "ogg" : input.formatId);

  try {
    const command = buildExtractAudioCommand({ input: inputName, output: outputName, startMs: input.startMs, endMs: input.endMs, copy: input.copy, formatId: input.formatId, bitrateKbps: input.bitrateKbps });
    const result = await runFfmpegJob(command);
    if (!result.ok) return { ok: false, error: result.error };
    const bytes = await readOutputFile(load.ffmpeg, outputName);
    if (bytes.length === 0) return { ok: false, error: buildFileError("corrupted", "El resultado quedó vacío.") };
    return { ok: true, bytes };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, [inputName, outputName]);
  }
}

export interface VideoToGifInput {
  bytes: Uint8Array;
  extension: string;
  startMs: number;
  endMs: number;
  fps: number;
  width: number;
  loop: boolean;
}

export async function videoToGif(input: VideoToGifInput): Promise<MediaJobResult> {
  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputName = await writeInputFile(load.ffmpeg, input.bytes, input.extension);
  const paletteName = generateVirtualName("output", "png");
  const outputName = generateVirtualName("output", "gif");

  try {
    const gifOpts = { input: inputName, paletteOutput: paletteName, output: outputName, startMs: input.startMs, endMs: input.endMs, fps: input.fps, width: input.width, loop: input.loop };
    const paletteResult = await runFfmpegJob(buildGifPaletteCommand(gifOpts));
    if (!paletteResult.ok) return { ok: false, error: paletteResult.error };
    const applyResult = await runFfmpegJob(buildGifApplyCommand(gifOpts));
    if (!applyResult.ok) return { ok: false, error: applyResult.error };
    const bytes = await readOutputFile(load.ffmpeg, outputName);
    if (bytes.length === 0) return { ok: false, error: buildFileError("corrupted", "El resultado quedó vacío.") };
    // GIF signature is "GIF87a" or "GIF89a" — a real structural check, not just "bytes exist".
    const signature = new TextDecoder().decode(bytes.slice(0, 6));
    if (signature !== "GIF87a" && signature !== "GIF89a") return { ok: false, error: buildFileError("corrupted", "El archivo generado no tiene una firma GIF válida.") };
    return { ok: true, bytes };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, [inputName, paletteName, outputName]);
  }
}

export interface ExtractFramesInput {
  bytes: Uint8Array;
  extension: string;
  mode: FrameExtractionMode;
  timeMs?: number;
  intervalSeconds?: number;
  count?: number;
  durationMs?: number;
  format: "png" | "mjpeg" | "webp";
  quality?: number;
}

export interface ExtractFramesResult {
  ok: boolean;
  error?: FileErrorResult;
  frames?: { name: string; bytes: Uint8Array }[];
}

export async function extractFrames(input: ExtractFramesInput): Promise<ExtractFramesResult> {
  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputName = await writeInputFile(load.ffmpeg, input.bytes, input.extension);
  const ext = input.format === "mjpeg" ? "jpg" : input.format;
  const outputPattern = generateVirtualName("output", ext).replace(/\.(\w+)$/, "-%03d.$1");
  const writtenNames: string[] = [inputName];

  try {
    const command = buildExtractFramesCommand({ input: inputName, outputPattern, mode: input.mode, timeMs: input.timeMs, intervalSeconds: input.intervalSeconds, count: input.count, durationMs: input.durationMs, format: input.format, quality: input.quality });
    const result = await runFfmpegJob(command);
    if (!result.ok) return { ok: false, error: result.error };

    const frames: { name: string; bytes: Uint8Array }[] = [];
    for (let i = 1; i <= 500; i++) {
      const name = outputPattern.replace("%03d", String(i).padStart(3, "0"));
      try {
        const bytes = await readOutputFile(load.ffmpeg, name);
        if (bytes.length === 0) break;
        frames.push({ name, bytes });
        writtenNames.push(name);
      } catch {
        break;
      }
    }
    if (frames.length === 0) return { ok: false, error: buildFileError("corrupted", "No se generó ningún fotograma.") };
    return { ok: true, frames };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, writtenNames);
  }
}
