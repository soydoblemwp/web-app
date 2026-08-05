/**
 * Dedicated Web Worker that actually executes a user's regex against user
 * text — the main thread never calls `RegExp.exec`/`.test`/`.replace` on
 * untrusted patterns itself (spec section 20). A catastrophic-backtracking
 * pattern can still hang THIS worker's thread (JS regex execution is
 * synchronous and cannot be preempted from inside), which is exactly why
 * the main-thread caller (`regex-tester-tool.tsx`) races this worker
 * against a `setTimeout` and calls `worker.terminate()` if it fires first
 * — termination has to happen from the outside.
 */
import { buildSafeRegExp, computeMatches, applyReplace, type RegexMatchResult } from "./regex";

export interface RegexWorkerRequest {
  requestId: number;
  pattern: string;
  flags: string;
  text: string;
  mode: "match" | "replace";
  replacement: string;
  maxMatches: number;
}

export interface RegexWorkerResponse {
  requestId: number;
  ok: boolean;
  error?: string;
  matches?: RegexMatchResult[];
  truncated?: boolean;
  replaced?: string;
  durationMs: number;
}

self.onmessage = (event: MessageEvent<RegexWorkerRequest>) => {
  const { requestId, pattern, flags, text, mode, replacement, maxMatches } = event.data;
  const startedAt = performance.now();

  const built = buildSafeRegExp(pattern, flags);
  if (!built.ok || !built.regex) {
    const response: RegexWorkerResponse = { requestId, ok: false, error: built.error, durationMs: performance.now() - startedAt };
    (self as unknown as Worker).postMessage(response);
    return;
  }

  try {
    if (mode === "replace") {
      const replaced = applyReplace(built.regex, text, replacement);
      const response: RegexWorkerResponse = { requestId, ok: true, replaced, durationMs: performance.now() - startedAt };
      (self as unknown as Worker).postMessage(response);
    } else {
      const { matches, truncated } = computeMatches(built.regex, text, maxMatches);
      const response: RegexWorkerResponse = { requestId, ok: true, matches, truncated, durationMs: performance.now() - startedAt };
      (self as unknown as Worker).postMessage(response);
    }
  } catch (err) {
    const response: RegexWorkerResponse = { requestId, ok: false, error: err instanceof Error ? err.message : "Error al ejecutar la expresión.", durationMs: performance.now() - startedAt };
    (self as unknown as Worker).postMessage(response);
  }
};
