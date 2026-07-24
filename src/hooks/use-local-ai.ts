"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateLocalText, getLocalEngine, isWebGPUSupported, onEngineProgress } from "@/lib/ai/local/engine";
import { LOCAL_MODEL_APPROX_SIZE_LABEL } from "@/lib/ai/local/model-config";
import { LocalAIError, type LocalEngineStatus, type LocalGenerateParams } from "@/lib/ai/local/types";

export interface UseLocalAIResult {
  status: LocalEngineStatus;
  /** 0..1 download/init progress, only meaningful while status === "loading". */
  progress: number;
  progressText: string;
  error: string | null;
  modelSizeLabel: string | null;
  generate: (params: LocalGenerateParams) => Promise<string | null>;
  cancel: () => void;
  retry: () => void;
}

/**
 * Shared client-side entry point for every AI form/tool. Runs generation
 * entirely in this browser tab via the Web Worker in src/lib/ai/local — no
 * prompt or result is ever sent to a server.
 */
export function useLocalAI(): UseLocalAIResult {
  const [status, setStatus] = useState<LocalEngineStatus>(() => (isWebGPUSupported() ? "idle" : "unsupported"));
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<LocalGenerateParams | null>(null);

  useEffect(
    () =>
      onEngineProgress((report) => {
        setProgress(report.progress);
        setProgressText(report.text);
      }),
    []
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const generate = useCallback(async (params: LocalGenerateParams): Promise<string | null> => {
    if (!isWebGPUSupported()) {
      setStatus("unsupported");
      return null;
    }

    lastParamsRef.current = params;
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setStatus("loading");
      await getLocalEngine();
      setStatus("generating");
      const text = await generateLocalText(params, { signal: controller.signal });
      setStatus("ready");
      return text;
    } catch (err) {
      const message =
        err instanceof LocalAIError ? err.message : "No se pudo generar contenido con la IA local.";
      const unsupported = err instanceof LocalAIError && !err.retryable;
      setError(message);
      setStatus(unsupported ? "unsupported" : "error");
      return null;
    } finally {
      abortRef.current = null;
    }
  }, []);

  const retry = useCallback(() => {
    if (lastParamsRef.current) void generate(lastParamsRef.current);
  }, [generate]);

  return {
    status,
    progress,
    progressText,
    error,
    modelSizeLabel: LOCAL_MODEL_APPROX_SIZE_LABEL,
    generate,
    cancel,
    retry,
  };
}
