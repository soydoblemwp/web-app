import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

/**
 * Entire content of the Web Worker: all model inference happens here, off
 * the main thread. `WebWorkerMLCEngineHandler` owns its own internal
 * `MLCEngine` and answers the message protocol that `WebWorkerMLCEngine`
 * (see worker-client.ts) speaks on the main thread.
 */
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
