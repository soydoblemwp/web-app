/**
 * Centralized limits for every audio/video/recording public tool (spec
 * section 14) — chosen to stay viable on a typical phone (FFmpeg WASM
 * runs single-threaded in this app, entirely in the tab's own memory) and
 * deliberately well below WebAssembly's raw addressable-memory ceiling,
 * which is never used as the public "recommended" limit (spec: "no
 * utilices el límite técnico absoluto de WebAssembly como límite
 * público").
 */
export const MEDIA_LIMITS = {
  audio: {
    maxFileBytes: 100 * 1024 * 1024,
    maxDurationSeconds: 60 * 30,
    maxFilesToJoin: 20,
    maxTotalBytes: 300 * 1024 * 1024,
  },
  video: {
    maxFileBytes: 500 * 1024 * 1024,
    maxDurationSeconds: 60 * 20,
    maxWidth: 3840,
    maxHeight: 2160,
    maxTotalPixelsPerFrame: 3840 * 2160,
    maxFps: 60,
  },
  gif: {
    maxDurationSeconds: 20,
    maxFps: 30,
    maxWidth: 800,
    maxEstimatedFrames: 600,
  },
  frames: {
    maxCount: 60,
    maxGridCells: 30,
  },
  subtitles: {
    maxCues: 5000,
    maxFileBytes: 5 * 1024 * 1024,
  },
  recording: {
    maxDurationSeconds: 60 * 30,
    maxEstimatedBytes: 1024 * 1024 * 1024,
  },
  concurrency: {
    maxSimultaneousJobs: 1,
  },
} as const;

export const ACCEPTED_AUDIO_MIMES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg", "audio/flac", "audio/webm"] as const;
export const ACCEPTED_VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/ogg"] as const;
export const ACCEPTED_SUBTITLE_MIMES = ["text/plain", "text/vtt", "application/x-subrip"] as const;

/**
 * A rough, honest heuristic for "this device probably doesn't have enough
 * headroom to run a WASM transcode comfortably" — `navigator.deviceMemory`
 * is Chromium-only and never treated as the sole signal (spec section 14:
 * "no utilices navigator.deviceMemory como única garantía"). When it's
 * unavailable, this returns `null` (unknown), not a false "safe" default.
 */
export function estimateLowMemoryDevice(): boolean | null {
  if (typeof navigator === "undefined") return null;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof deviceMemory !== "number") return null;
  return deviceMemory <= 2;
}
