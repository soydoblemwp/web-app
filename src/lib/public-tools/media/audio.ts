import { ensureFfmpegLoaded, runFfmpegJob, getDetectedEncoders } from "./ffmpeg-client";
import { writeInputFile, readOutputFile, cleanupVirtualFiles, generateVirtualName } from "./ffmpeg-filesystem";
import { buildTrimAudioCommand, buildConcatAudioCommand, buildConvertAudioCommand, AUDIO_ENCODERS, type AudioFormatId } from "./ffmpeg-commands";
import { resolveAvailableFormats, getFormatsByKind } from "./capabilities";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";

export interface MediaJobResult {
  ok: boolean;
  error?: FileErrorResult;
  bytes?: Uint8Array;
  /** The format the output bytes are ACTUALLY encoded in — only differs from the requested `formatId` when a real stream copy preserved the source's own codec/container instead of transcoding (e.g. trimAudio() without fades). Callers must label/MIME-type the result from this, never blindly from the requested formatId. */
  actualExtension?: string;
}

export function getAvailableAudioFormats() {
  const detected = resolveAvailableFormats(getDetectedEncoders()).filter((f) => f.kind === "audio");
  return detected.length > 0 ? detected : getFormatsByKind("audio");
}

export interface TrimAudioInput {
  bytes: Uint8Array;
  extension: string;
  startMs: number;
  endMs: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  formatId: AudioFormatId;
  useCopyWhenPossible: boolean;
}

export async function trimAudio(input: TrimAudioInput): Promise<MediaJobResult> {
  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputName = await writeInputFile(load.ffmpeg, input.bytes, input.extension);
  const requestedExt = AUDIO_ENCODERS[input.formatId] ? input.formatId.replace("ogg-vorbis", "ogg") : input.extension;
  const hasFades = Boolean(input.fadeInMs || input.fadeOutMs);
  // A real "-c copy" can only ever preserve the SOURCE's own codec — it can
  // never transcode. Only attempt it when the requested output format
  // already matches the source's container; otherwise always re-encode, so
  // the bytes we hand back are genuinely in the format we claim they are
  // (never silently mislabel raw source bytes as the requested format).
  const canCopy = input.useCopyWhenPossible && !hasFades && requestedExt.toLowerCase() === input.extension.toLowerCase();
  const outputExt = canCopy ? input.extension : requestedExt;
  const outputName = generateVirtualName("output", outputExt);

  try {
    const command = buildTrimAudioCommand({
      input: inputName,
      output: outputName,
      startMs: input.startMs,
      endMs: input.endMs,
      fadeInMs: input.fadeInMs,
      fadeOutMs: input.fadeOutMs,
      copyCodec: canCopy,
      formatId: input.formatId,
    });
    const result = await runFfmpegJob(command);
    if (!result.ok) return { ok: false, error: result.error };
    const bytes = await readOutputFile(load.ffmpeg, outputName);
    if (bytes.length === 0) return { ok: false, error: buildFileError("corrupted", "El resultado quedó vacío.") };
    return { ok: true, bytes, actualExtension: outputExt };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, [inputName, outputName]);
  }
}

export interface JoinAudiosInput {
  files: { bytes: Uint8Array; extension: string }[];
  formatId: AudioFormatId;
  bitrateKbps?: number;
  sampleRate?: number;
}

export async function joinAudios(input: JoinAudiosInput): Promise<MediaJobResult> {
  if (input.files.length < 2) return { ok: false, error: buildFileError("limit-exceeded", "Selecciona al menos 2 archivos para unir.") };

  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputNames: string[] = [];
  const outputName = generateVirtualName("output", input.formatId === "ogg-vorbis" ? "ogg" : input.formatId);

  try {
    for (const file of input.files) {
      inputNames.push(await writeInputFile(load.ffmpeg, file.bytes, file.extension));
    }
    const command = buildConcatAudioCommand({ inputs: inputNames, output: outputName, formatId: input.formatId, bitrateKbps: input.bitrateKbps, sampleRate: input.sampleRate });
    const result = await runFfmpegJob(command);
    if (!result.ok) return { ok: false, error: result.error };
    const bytes = await readOutputFile(load.ffmpeg, outputName);
    if (bytes.length === 0) return { ok: false, error: buildFileError("corrupted", "El resultado quedó vacío.") };
    return { ok: true, bytes };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, [...inputNames, outputName]);
  }
}

export interface ConvertAudioInput {
  bytes: Uint8Array;
  extension: string;
  formatId: AudioFormatId;
  bitrateKbps?: number;
  sampleRate?: number;
  channels?: 1 | 2;
  stripMetadata: boolean;
}

export async function convertAudio(input: ConvertAudioInput): Promise<MediaJobResult> {
  const load = await ensureFfmpegLoaded();
  if (!load.ok || !load.ffmpeg) return { ok: false, error: load.error };

  const inputName = await writeInputFile(load.ffmpeg, input.bytes, input.extension);
  const outputName = generateVirtualName("output", input.formatId === "ogg-vorbis" ? "ogg" : input.formatId);

  try {
    const command = buildConvertAudioCommand({
      input: inputName,
      output: outputName,
      formatId: input.formatId,
      bitrateKbps: input.bitrateKbps,
      sampleRate: input.sampleRate,
      channels: input.channels,
      stripMetadata: input.stripMetadata,
    });
    const result = await runFfmpegJob(command);
    if (!result.ok) return { ok: false, error: result.error };
    const bytes = await readOutputFile(load.ffmpeg, outputName);
    if (bytes.length === 0) return { ok: false, error: buildFileError("corrupted", "El resultado quedó vacío.") };
    return { ok: true, bytes };
  } finally {
    await cleanupVirtualFiles(load.ffmpeg, [inputName, outputName]);
  }
}
