import { resolveFfmpegAssetPaths } from "./ffmpeg-assets";
import { parseTimeFromLogLine, type ProcessingStep } from "./ffmpeg-progress";
import { parseEncoderListing } from "./capabilities";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";

/**
 * The single shared FFmpeg manager every audio/video tool goes through —
 * no tool creates its own `FFmpeg()` instance directly (spec section 11:
 * "crea un administrador compartido"). FFmpeg is imported dynamically,
 * only from here, only ever in the browser (spec section 10: "la carga
 * debe realizarse únicamente en el navegador y de forma dinámica").
 *
 * Single-thread core by deliberate default (spec section 10) — this app
 * does not set COOP/COEP globally, so `SharedArrayBuffer` (required by the
 * multi-thread `@ffmpeg/core-mt` core) is not guaranteed to exist across
 * every route; enabling it here would be an all-or-nothing header change
 * with real risk to login/OAuth/Google Integrations/the customer-support
 * widget's iframe embedding, which was explicitly out of scope to
 * evaluate for this phase. Single-thread is slower on large files but has
 * zero cross-cutting header risk.
 */
export type FfmpegManagerState = "unloaded" | "loading-core" | "initializing" | "ready" | "processing" | "cancelling" | "cancelled" | "error" | "terminated";

export interface FfmpegProgressEvent {
  step: ProcessingStep;
  processedMs: number;
}

type ProgressListener = (event: FfmpegProgressEvent) => void;
type LogListener = (line: string) => void;

// Minimal structural shape of the real @ffmpeg/ffmpeg instance this module drives — kept local so
// non-browser code (tests, other modules) never needs to import the package's own types.
interface FfmpegInstance {
  load(config: { coreURL: string; wasmURL: string; classWorkerURL?: string }): Promise<boolean>;
  exec(args: string[]): Promise<number>;
  writeFile(name: string, data: Uint8Array): Promise<boolean>;
  readFile(name: string): Promise<Uint8Array | string>;
  deleteFile(name: string): Promise<boolean>;
  terminate(): void;
  on(event: "log", cb: (payload: { message: string }) => void): void;
  on(event: "progress", cb: (payload: { progress: number; time: number }) => void): void;
}

let instance: FfmpegInstance | null = null;
let state: FfmpegManagerState = "unloaded";
let detectedEncoders: Set<string> | null = null;
let progressListeners: ProgressListener[] = [];
let logListeners: LogListener[] = [];
let currentProcessedMs = 0;
// `@ffmpeg/util`'s toBlobURL() creates real Object URLs for the core JS/WASM assets so they can be
// handed to ffmpeg.load() — a real Chromium test (URL.createObjectURL/revokeObjectURL instrumented)
// caught these never being revoked anywhere, leaving them alive for the page's full lifetime even
// after cancel/terminate. Tracked here so cancelFfmpegJob()/terminateFfmpeg() can really release them.
let loadedAssetBlobUrls: string[] = [];
// A real Chromium test caught a genuine cancellation gap: clicking Cancelar while the core is
// still loading (`instance` is still null — nothing for cancelFfmpegJob() to .terminate()) let the
// in-flight ensureFfmpegLoaded() call finish anyway, silently overwrite state back to "ready", and
// start the job the visitor had just cancelled. This flag lets ensureFfmpegLoaded() notice a
// cancellation that arrived mid-load and abort the freshly-loaded instance instead of using it.
let cancelRequestedDuringLoad = false;

function revokeLoadedAssetBlobUrls(): void {
  for (const url of loadedAssetBlobUrls) URL.revokeObjectURL(url);
  loadedAssetBlobUrls = [];
}

export function getFfmpegState(): FfmpegManagerState {
  return state;
}

export function getDetectedEncoders(): Set<string> | null {
  return detectedEncoders;
}

export function onFfmpegProgress(listener: ProgressListener): () => void {
  progressListeners.push(listener);
  return () => {
    progressListeners = progressListeners.filter((l) => l !== listener);
  };
}

export function onFfmpegLog(listener: LogListener): () => void {
  logListeners.push(listener);
  return () => {
    logListeners = logListeners.filter((l) => l !== listener);
  };
}

function emitProgress(step: ProcessingStep) {
  for (const listener of progressListeners) listener({ step, processedMs: currentProcessedMs });
}

export interface EnsureFfmpegResult {
  ok: boolean;
  ffmpeg?: FfmpegInstance;
  error?: FileErrorResult;
}

/**
 * Loads (or reuses) the shared FFmpeg instance. Only ever called from a
 * tool component in response to the visitor actually running an
 * operation — never at import time or on page load (spec section 37).
 */
export async function ensureFfmpegLoaded(): Promise<EnsureFfmpegResult> {
  if (state === "ready" && instance) return { ok: true, ffmpeg: instance };
  if (state === "processing" || state === "loading-core" || state === "initializing") {
    return { ok: false, error: buildFileError("limit-exceeded", "Ya hay una operación multimedia en curso; espera a que termine o cancélala.") };
  }

  cancelRequestedDuringLoad = false;
  try {
    state = "loading-core";
    emitProgress("loading-core");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    const next = new FFmpeg() as unknown as FfmpegInstance;
    next.on("log", ({ message }) => {
      for (const listener of logListeners) listener(message);
      const ms = parseTimeFromLogLine(message);
      if (ms !== null) currentProcessedMs = ms;
    });

    state = "initializing";
    emitProgress("initializing");
    const { coreURL, wasmURL, classWorkerURL } = resolveFfmpegAssetPaths();
    const loadedCoreURL = await toBlobURL(coreURL, "text/javascript");
    const loadedWasmURL = await toBlobURL(wasmURL, "application/wasm");
    loadedAssetBlobUrls = [loadedCoreURL, loadedWasmURL];
    await next.load({ coreURL: loadedCoreURL, wasmURL: loadedWasmURL, classWorkerURL });

    if (cancelRequestedDuringLoad) {
      // The visitor cancelled while there was no live `instance` yet for cancelFfmpegJob() to
      // terminate — honor it now by discarding the instance we just finished loading instead of
      // silently promoting it to "ready" and running the job the visitor already cancelled.
      cancelRequestedDuringLoad = false;
      next.terminate();
      revokeLoadedAssetBlobUrls();
      state = "cancelled";
      return { ok: false, error: buildFileError("cancelled") };
    }

    instance = next;
    state = "ready";
    void detectEncoders();
    return { ok: true, ffmpeg: instance };
  } catch (err) {
    state = "error";
    return { ok: false, error: buildFileError("ffmpeg-load-failed", err instanceof Error ? err.message : undefined) };
  }
}

async function detectEncoders(): Promise<void> {
  if (!instance) return;
  const collected: string[] = [];
  const unsubscribe = onFfmpegLog((line) => collected.push(line));
  try {
    await instance.exec(["-encoders"]);
  } catch {
    // Some core builds exit non-zero for informational commands — the log lines are still captured above.
  } finally {
    unsubscribe();
  }
  detectedEncoders = parseEncoderListing(collected.join("\n"));
}

export interface RunFfmpegJobResult {
  ok: boolean;
  error?: FileErrorResult;
}

/** Wraps a single `exec()` call with the shared processing/cancelling state transitions — callers in audio.ts/video.ts pass the already-built, validated argv. */
export async function runFfmpegJob(args: string[]): Promise<RunFfmpegJobResult> {
  if (!instance || state !== "ready") {
    return { ok: false, error: buildFileError("ffmpeg-load-failed", "El motor multimedia no está listo.") };
  }
  state = "processing";
  currentProcessedMs = 0;
  emitProgress("processing");
  try {
    await instance.exec(args);
    // cancelFfmpegJob() moves state all the way to "cancelled" synchronously (there's no `await`
    // point where an intermediate "cancelling" would ever be observed here) — checking for
    // "cancelling" was dead code that let a cancelled-but-somehow-resolving exec() report success.
    if ((state as FfmpegManagerState) === "cancelled") return { ok: false, error: buildFileError("cancelled") };
    state = "ready";
    return { ok: true };
  } catch (err) {
    if ((state as FfmpegManagerState) === "cancelled" || (state as FfmpegManagerState) === "cancelling") {
      state = "cancelled";
      return { ok: false, error: buildFileError("cancelled") };
    }
    state = "error";
    return { ok: false, error: buildFileError("corrupted", err instanceof Error ? err.message : "Error al procesar el archivo.") };
  }
}

/**
 * Cancellation terminates the FFmpeg Worker outright — the installed
 * `@ffmpeg/ffmpeg` version has no supported mid-exec abort, so termination
 * is the real, honest mechanism (spec section 18: "aborta... cuando la API
 * lo permita; o termina la instancia"). The manager resets to "unloaded" so
 * the next operation transparently reloads a fresh core.
 */
export function cancelFfmpegJob(): void {
  if (state !== "processing" && state !== "loading-core" && state !== "initializing") return;
  if (state === "loading-core" || state === "initializing") {
    // No live `instance` yet to terminate — flag it so ensureFfmpegLoaded() aborts the instance
    // the moment its in-flight load finishes, instead of promoting it to "ready" and running the
    // job anyway (the real gap a Chromium test caught: cancelling mid-load did nothing).
    cancelRequestedDuringLoad = true;
    state = "cancelled";
    return;
  }
  state = "cancelling";
  instance?.terminate();
  instance = null;
  detectedEncoders = null;
  revokeLoadedAssetBlobUrls();
  state = "cancelled";
}

/** Full teardown — called on tool unmount/reset even if no cancellation was requested (spec section 11: "no dejes una instancia corrupta"). */
export function terminateFfmpeg(): void {
  instance?.terminate();
  instance = null;
  detectedEncoders = null;
  progressListeners = [];
  logListeners = [];
  currentProcessedMs = 0;
  revokeLoadedAssetBlobUrls();
  state = "terminated";
}

/** Allows a fresh `ensureFfmpegLoaded()` call after cancellation/termination/error (spec section 11: "permite reiniciar después de terminate()"). */
export function resetFfmpegManager(): void {
  if (state === "processing") return;
  instance = null;
  detectedEncoders = null;
  currentProcessedMs = 0;
  state = "unloaded";
}
