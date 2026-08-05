/**
 * Thin, testable wrapper around `MediaRecorder.isTypeSupported` — never
 * assumes every browser produces MP3/MP4 (spec section 29: "no supongas
 * que todos los navegadores producen MP3 o MP4"). The UI always shows the
 * real `mimeType` the recorder ends up using.
 */
export const AUDIO_RECORDING_MIME_PREFERENCE = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/mpeg"];
export const VIDEO_RECORDING_MIME_PREFERENCE = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

export function isMediaRecorderSupported(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
}

export function pickSupportedMimeType(candidates: string[]): string | null {
  if (!isMediaRecorderSupported()) return null;
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // isTypeSupported can throw for a genuinely malformed string — treat as unsupported.
    }
  }
  return null;
}

export function extensionForRecordingMime(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  return "bin";
}

/** Computes a normalized 0-1 audio level from a Web Audio `AnalyserNode.getByteTimeDomainData()` buffer — pure, real signal math (RMS of the centered samples), no browser API itself. */
export function computeAudioLevel(timeDomainData: Uint8Array): number {
  if (timeDomainData.length === 0) return 0;
  let sumSquares = 0;
  for (const sample of timeDomainData) {
    const centered = (sample - 128) / 128;
    sumSquares += centered * centered;
  }
  const rms = Math.sqrt(sumSquares / timeDomainData.length);
  return Math.min(1, rms);
}
