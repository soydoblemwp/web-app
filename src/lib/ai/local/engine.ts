import "client-only";
import type { InitProgressReport, WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { createLocalAIEngine, createLocalAIWorker } from "./worker-client";
import { LOCAL_MODEL_ID } from "./model-config";
import { LocalAIError, type LocalGenerateParams } from "./types";

export function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

type ProgressListener = (report: InitProgressReport) => void;

// Module-level state: one worker + one engine per browser tab, shared by
// every AI form/tool on the page. Lazily created on the first `generate*`
// call, memoized afterwards so a second click never re-downloads or
// re-initializes the model.
let worker: Worker | null = null;
let currentEngine: WebWorkerMLCEngine | null = null;
let enginePromise: Promise<WebWorkerMLCEngine> | null = null;
const progressListeners = new Set<ProgressListener>();

function notifyProgress(report: InitProgressReport): void {
  for (const listener of progressListeners) listener(report);
}

/** Subscribe to model download/init progress. Returns an unsubscribe function. */
export function onEngineProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

/** Tears down the current worker/engine so the next call starts fresh — used after a crash or explicit unload. */
export function resetEngine(): void {
  worker?.terminate();
  worker = null;
  currentEngine = null;
  enginePromise = null;
}

/** Lazily creates (once per tab) and returns the shared local engine, downloading/loading the model on first call. */
export async function getLocalEngine(): Promise<WebWorkerMLCEngine> {
  if (!isWebGPUSupported()) {
    throw new LocalAIError(
      "Este dispositivo o navegador no admite la IA local. Utiliza una versión reciente de Chrome o Edge en un equipo compatible.",
      false
    );
  }

  if (currentEngine) return currentEngine;
  if (enginePromise) return enginePromise;

  const newWorker = createLocalAIWorker();
  newWorker.onerror = () => {
    // The worker crashed (e.g. lost GPU device) — discard it so the next
    // generate() call spins up a fresh worker + engine instead of hanging.
    resetEngine();
  };
  worker = newWorker;

  enginePromise = createLocalAIEngine(newWorker, { initProgressCallback: notifyProgress })
    .then((engine) => {
      currentEngine = engine;
      return engine;
    })
    .catch((error: unknown) => {
      resetEngine();
      throw error instanceof LocalAIError
        ? error
        : new LocalAIError(
            error instanceof Error ? error.message : "No se pudo cargar el modelo de IA local.",
            true
          );
    });

  return enginePromise;
}

function toChatMessages(params: LocalGenerateParams) {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (params.system) messages.push({ role: "system", content: params.system });
  for (const turn of params.history ?? []) messages.push({ role: turn.role, content: turn.content });
  messages.push({ role: "user", content: params.prompt });
  return messages;
}

export interface GenerateOptions {
  signal?: AbortSignal;
}

/** Runs a single generation on the shared local engine. The prompt never leaves this browser tab. */
export async function generateLocalText(
  params: LocalGenerateParams,
  options: GenerateOptions = {}
): Promise<string> {
  const engine = await getLocalEngine();

  if (options.signal?.aborted) throw new LocalAIError("Generación cancelada.", true);

  const onAbort = () => engine.interruptGenerate();
  options.signal?.addEventListener("abort", onAbort);

  try {
    const response = await engine.chat.completions.create({
      messages: toChatMessages(params),
      max_tokens: params.maxTokens ?? 1536,
      stream: false,
    });

    if (options.signal?.aborted) throw new LocalAIError("Generación cancelada.", true);
    return response.choices[0]?.message?.content ?? "";
  } catch (error) {
    if (options.signal?.aborted) throw new LocalAIError("Generación cancelada.", true);
    if (error instanceof LocalAIError) throw error;
    throw new LocalAIError(
      error instanceof Error ? error.message : "Error al generar contenido con la IA local.",
      true
    );
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export { LOCAL_MODEL_ID };
