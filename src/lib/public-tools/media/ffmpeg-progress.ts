/**
 * Progress is derived from FFmpeg's own stderr log lines ("... time=00:00:03.21
 * ...") rather than trusted blindly from the library's built-in `progress`
 * event (spec section 17: "no confíes ciegamente en un porcentaje
 * experimental... calcula progreso mediante... tiempo procesado extraído
 * de logs"). The library's own event is still read as a secondary hint,
 * but every value is clamped and never shown as 100% before the real
 * completion checklist in `FfmpegJobState` (see ffmpeg-client.ts) is done.
 */
const TIME_LOG_PATTERN = /time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/;

export function parseTimeFromLogLine(line: string): number | null {
  const match = TIME_LOG_PATTERN.exec(line);
  if (!match) return null;
  const [, h, m, s, centis] = match;
  return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(centis) * 10;
}

export type ProcessingStep = "loading-core" | "initializing" | "writing-input" | "processing" | "reading-output" | "finalizing" | "done";

export interface MediaProgressState {
  step: ProcessingStep;
  percent: number | null; // null = indeterminate, never a guessed number
  processedMs: number;
  totalMs: number | null;
}

export function computeMediaProgress(step: ProcessingStep, processedMs: number, totalMs: number | null): MediaProgressState {
  if (step !== "processing" || !totalMs || totalMs <= 0) {
    return { step, percent: step === "done" ? 100 : null, processedMs, totalMs };
  }
  const percent = Math.max(0, Math.min(99, Math.round((processedMs / totalMs) * 100)));
  // Capped at 99 while step === "processing" — the real 100% is only ever set by the "done" step,
  // once the output has actually been read back from the virtual filesystem (spec section 17, steps 1-4).
  return { step, percent, processedMs, totalMs };
}
