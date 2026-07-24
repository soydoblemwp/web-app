import { CreateWebWorkerMLCEngine, type MLCEngineConfig, type WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { LOCAL_MODEL_ID } from "./model-config";

/** Spawns the module Web Worker that src/lib/ai/local/worker.ts compiles into. */
export function createLocalAIWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}

/** Connects to a freshly-spawned worker and loads the local model into it. */
export function createLocalAIEngine(worker: Worker, config: MLCEngineConfig): Promise<WebWorkerMLCEngine> {
  return CreateWebWorkerMLCEngine(worker, LOCAL_MODEL_ID, config);
}
