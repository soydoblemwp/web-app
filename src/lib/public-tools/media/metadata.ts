/**
 * Technical metadata (duration/dimensions/audio presence) is read via the
 * browser's own `<audio>`/`<video>` element metadata loading — real
 * browser behavior, not a guess from the container header. This module
 * has no server fallback and is never called outside the browser.
 */
export interface AudioMetadata {
  durationMs: number;
}

export interface VideoMetadata {
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export function readAudioMetadata(objectUrl: string): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const durationMs = Number.isFinite(el.duration) ? el.duration * 1000 : 0;
      resolve({ durationMs });
      el.src = "";
    };
    el.onerror = () => reject(new Error("No se pudo leer la información del audio."));
    el.src = objectUrl;
  });
}

interface VendorAudioFlags extends HTMLVideoElement {
  mozHasAudio?: boolean;
  webkitAudioDecodedByteCount?: number;
  audioTracks?: { length: number };
}

/**
 * Reads the non-standard-but-widely-supported vendor audio-presence flags.
 * Returns `null` when every flag is either absent or ambiguous.
 *
 * `webkitAudioDecodedByteCount === 0` is ambiguous BEFORE a real decode
 * attempt (nothing has been decoded yet, present or not) but becomes real
 * evidence of absence AFTER one (`trustZeroByteCount: true` — a video with a
 * genuine audio track empirically produces a nonzero count within ~150ms of
 * play(), confirmed against a real synthetic-oscillator fixture in Chromium).
 */
function readVendorAudioFlags(el: HTMLVideoElement, trustZeroByteCount: boolean): boolean | null {
  const w = el as VendorAudioFlags;
  if (typeof w.mozHasAudio === "boolean") return w.mozHasAudio;
  if (typeof w.webkitAudioDecodedByteCount === "number") {
    if (w.webkitAudioDecodedByteCount > 0) return true;
    if (trustZeroByteCount) return false;
  } else if (w.audioTracks) {
    return w.audioTracks.length > 0;
  }
  return null;
}

/**
 * Detects an audio track on a <video> element. `mozHasAudio`/`audioTracks`
 * are trustworthy immediately; Chromium's `webkitAudioDecodedByteCount` is
 * only meaningful AFTER real decoding has happened — at `loadedmetadata`
 * (preload="metadata", nothing played yet) it is always 0 regardless of
 * whether a track exists, which a real-Chromium test caught producing a
 * false "no audio" for a video that genuinely had one. When every flag is
 * ambiguous, this briefly (muted) plays and pauses the element to force one
 * real decoded frame before reading the flags again — a guess in either
 * direction here would either silently skip a real track or generate an
 * empty/misleading result, both explicitly forbidden by spec.
 */
async function detectHasAudio(el: HTMLVideoElement): Promise<boolean> {
  const direct = readVendorAudioFlags(el, false);
  if (direct !== null) return direct;
  try {
    el.muted = true;
    await el.play();
    await new Promise((resolve) => setTimeout(resolve, 150));
    el.pause();
    el.currentTime = 0;
  } catch {
    // play() can still reject in some embedding contexts — fall through to whatever flags we have.
  }
  const afterDecode = readVendorAudioFlags(el, true);
  return afterDecode ?? true; // still unknown even after a real decode attempt — assume present rather than silently skipping a real track.
}

export function readVideoMetadata(objectUrl: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => {
      const durationMs = Number.isFinite(el.duration) ? el.duration * 1000 : 0;
      detectHasAudio(el).then((hasAudio) => {
        resolve({ durationMs, width: el.videoWidth, height: el.videoHeight, hasAudio });
        el.src = "";
      });
    };
    el.onerror = () => reject(new Error("No se pudo leer la información del video."));
    el.src = objectUrl;
  });
}
