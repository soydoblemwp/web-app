/**
 * Stops every track on a MediaStream and returns true only once every
 * track's `readyState` is actually `"ended"` — the real, checkable proof
 * that the browser released the device (spec: "no declares que una pista
 * fue detenida sin verificar readyState === 'ended' cuando sea
 * comprobable").
 */
export function stopAllTracks(stream: MediaStream | null | undefined): boolean {
  if (!stream) return true;
  for (const track of stream.getTracks()) {
    track.stop();
  }
  return stream.getTracks().every((track) => track.readyState === "ended");
}

export interface MediaCleanupTargets {
  streams?: (MediaStream | null | undefined)[];
  objectUrls?: { revokeAll: () => void }[];
  mediaRecorder?: MediaRecorder | null;
  terminateFfmpeg?: () => void;
}

/**
 * Single entry point every recording/FFmpeg tool calls on reset/unmount —
 * stops streams, revokes tracked Object URLs, stops a live MediaRecorder,
 * and terminates the shared FFmpeg instance if one was passed in. Centralizing
 * this means no tool has to remember the full teardown checklist itself
 * (spec section 35).
 */
export function performMediaCleanup(targets: MediaCleanupTargets): { allTracksStopped: boolean } {
  let allTracksStopped = true;
  for (const stream of targets.streams ?? []) {
    if (!stopAllTracks(stream)) allTracksStopped = false;
  }
  if (targets.mediaRecorder && targets.mediaRecorder.state !== "inactive") {
    try {
      targets.mediaRecorder.stop();
    } catch {
      // Already stopping/stopped — nothing further to do.
    }
  }
  for (const registry of targets.objectUrls ?? []) registry.revokeAll();
  targets.terminateFfmpeg?.();
  return { allTracksStopped };
}
