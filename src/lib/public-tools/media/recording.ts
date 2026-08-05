export type RecordingState = "idle" | "requesting-permission" | "recording" | "paused" | "stopping" | "stopped" | "permission-denied" | "device-unavailable" | "error";

export interface RecordingStateTransition {
  ok: boolean;
  next?: RecordingState;
  error?: string;
}

const ALLOWED_TRANSITIONS: Record<RecordingState, RecordingState[]> = {
  idle: ["requesting-permission"],
  "requesting-permission": ["recording", "permission-denied", "device-unavailable", "error"],
  recording: ["paused", "stopping", "error"],
  paused: ["recording", "stopping", "error"],
  stopping: ["stopped", "error"],
  stopped: ["idle"],
  "permission-denied": ["idle", "requesting-permission"],
  "device-unavailable": ["idle"],
  error: ["idle"],
};

/** A small explicit state machine so every recorder component transitions through the same allowed states (spec section 29/30 checklist: start/pause/resume/stop) instead of ad-hoc booleans. */
export function transitionRecordingState(current: RecordingState, next: RecordingState): RecordingStateTransition {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return { ok: false, error: `No se puede pasar de "${current}" a "${next}".` };
  }
  return { ok: true, next };
}

export function formatRecordingDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** A conservative, honest estimate (never a promise) of how large a recording is likely to be, from an assumed bitrate — used only to warn before hitting MEDIA_LIMITS.recording.maxEstimatedBytes, never shown as an exact figure. */
export function estimateRecordingBytes(elapsedMs: number, assumedBitrateKbps: number): number {
  return Math.round((elapsedMs / 1000) * (assumedBitrateKbps * 1000) / 8);
}
