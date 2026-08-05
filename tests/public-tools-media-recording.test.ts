import { describe, expect, it, vi } from "vitest";
import { transitionRecordingState, formatRecordingDuration, estimateRecordingBytes, type RecordingState } from "@/lib/public-tools/media/recording";
import {
  AUDIO_RECORDING_MIME_PREFERENCE,
  VIDEO_RECORDING_MIME_PREFERENCE,
  isMediaRecorderSupported,
  pickSupportedMimeType,
  extensionForRecordingMime,
  computeAudioLevel,
} from "@/lib/public-tools/media/media-recorder";
import { stopAllTracks, performMediaCleanup } from "@/lib/public-tools/media/cleanup";

function fakeTrack(finalState: "ended" | "live" = "ended") {
  return {
    readyState: "live" as "live" | "ended",
    stop() {
      this.readyState = finalState;
    },
  };
}

function fakeStream(tracks: ReturnType<typeof fakeTrack>[]) {
  return { getTracks: () => tracks } as unknown as MediaStream;
}

// ---------------------------------------------------------------------------
// recording.ts: transitionRecordingState — spec sections 29/30 (start/pause/
// resume/stop must go through one real state machine, not ad-hoc booleans)
// ---------------------------------------------------------------------------
describe("media/recording.ts: transitionRecordingState", () => {
  it("allows the real happy-path flow: idle -> requesting-permission -> recording -> paused -> recording -> stopping -> stopped -> idle", () => {
    const path: RecordingState[] = ["idle", "requesting-permission", "recording", "paused", "recording", "stopping", "stopped", "idle"];
    for (let i = 0; i < path.length - 1; i++) {
      const result = transitionRecordingState(path[i], path[i + 1]);
      expect(result.ok).toBe(true);
      expect(result.next).toBe(path[i + 1]);
    }
  });

  it("allows requesting-permission to end in permission-denied or device-unavailable, both recoverable back to idle", () => {
    expect(transitionRecordingState("requesting-permission", "permission-denied").ok).toBe(true);
    expect(transitionRecordingState("permission-denied", "idle").ok).toBe(true);
    expect(transitionRecordingState("requesting-permission", "device-unavailable").ok).toBe(true);
    expect(transitionRecordingState("device-unavailable", "idle").ok).toBe(true);
  });

  it("rejects an impossible jump straight from idle to recording (permission must be requested first)", () => {
    const result = transitionRecordingState("idle", "recording");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/idle/);
    expect(result.error).toMatch(/recording/);
  });

  it("rejects resuming from stopped without returning through idle", () => {
    expect(transitionRecordingState("stopped", "recording").ok).toBe(false);
  });

  it("rejects pausing a state that isn't actively recording", () => {
    expect(transitionRecordingState("idle", "paused").ok).toBe(false);
    expect(transitionRecordingState("stopped", "paused").ok).toBe(false);
  });

  it("allows any active state to transition to error, and error always recovers to idle", () => {
    expect(transitionRecordingState("recording", "error").ok).toBe(true);
    expect(transitionRecordingState("paused", "error").ok).toBe(true);
    expect(transitionRecordingState("error", "idle").ok).toBe(true);
    expect(transitionRecordingState("error", "recording").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recording.ts: formatRecordingDuration
// ---------------------------------------------------------------------------
describe("media/recording.ts: formatRecordingDuration", () => {
  it("formats sub-hour durations as MM:SS", () => {
    expect(formatRecordingDuration(0)).toBe("00:00");
    expect(formatRecordingDuration(65000)).toBe("01:05");
    expect(formatRecordingDuration(3599000)).toBe("59:59");
  });
  it("formats hour-or-longer durations as HH:MM:SS", () => {
    expect(formatRecordingDuration(3600000)).toBe("01:00:00");
    expect(formatRecordingDuration(3661000)).toBe("01:01:01");
  });
});

// ---------------------------------------------------------------------------
// recording.ts: estimateRecordingBytes — a conservative estimate only, never
// shown as an exact/promised figure per spec section 14
// ---------------------------------------------------------------------------
describe("media/recording.ts: estimateRecordingBytes", () => {
  it("computes bytes from elapsed time and an assumed bitrate (real arithmetic, not a guess)", () => {
    // 128 kbps for 10 seconds = 128,000 bits/s * 10s / 8 bits-per-byte = 160,000 bytes
    expect(estimateRecordingBytes(10000, 128)).toBe(160000);
  });
  it("returns 0 for zero elapsed time", () => {
    expect(estimateRecordingBytes(0, 128)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// media-recorder.ts — honest note: MediaRecorder does not exist as a global
// in the Node/Vitest environment used by this project, so the *browser*
// detection behavior of isMediaRecorderSupported/pickSupportedMimeType can't
// be exercised here (there is no real MediaRecorder to say yes to). What IS
// real and testable in Node is that these functions correctly and safely
// report "unsupported" rather than crashing or lying when no MediaRecorder
// global exists — which is itself the exact defensive behavior spec section
// 29 requires ("nunca asumas que MediaRecorder está disponible").
// ---------------------------------------------------------------------------
describe("media/media-recorder.ts: environment-detection functions (honest Node-environment behavior)", () => {
  it("isMediaRecorderSupported reports false in this Node test environment, rather than assuming support", () => {
    expect(isMediaRecorderSupported()).toBe(false);
  });
  it("pickSupportedMimeType returns null (not a guessed format) when no MediaRecorder is available", () => {
    expect(pickSupportedMimeType(AUDIO_RECORDING_MIME_PREFERENCE)).toBeNull();
    expect(pickSupportedMimeType(VIDEO_RECORDING_MIME_PREFERENCE)).toBeNull();
  });
  it("declares real, non-empty preference lists for audio and video formats", () => {
    expect(AUDIO_RECORDING_MIME_PREFERENCE.length).toBeGreaterThan(0);
    expect(VIDEO_RECORDING_MIME_PREFERENCE.length).toBeGreaterThan(0);
  });
});

describe("media/media-recorder.ts: extensionForRecordingMime", () => {
  it("maps each real recorder mimeType family to its correct file extension", () => {
    expect(extensionForRecordingMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForRecordingMime("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(extensionForRecordingMime("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionForRecordingMime("audio/mp4")).toBe("mp4");
    expect(extensionForRecordingMime("audio/mpeg")).toBe("mp3");
  });
  it("falls back to a safe generic extension for an unrecognized mimeType, never inventing a wrong one", () => {
    expect(extensionForRecordingMime("application/octet-stream")).toBe("bin");
  });
});

// ---------------------------------------------------------------------------
// media-recorder.ts: computeAudioLevel — pure RMS math, fully real-testable
// ---------------------------------------------------------------------------
describe("media/media-recorder.ts: computeAudioLevel", () => {
  it("returns 0 for silence (all samples at the 128 midpoint)", () => {
    const silence = new Uint8Array(64).fill(128);
    expect(computeAudioLevel(silence)).toBe(0);
  });
  it("returns 1 (max) for a full-amplitude square wave alternating 0/255", () => {
    const data = new Uint8Array(64);
    for (let i = 0; i < data.length; i++) data[i] = i % 2 === 0 ? 0 : 255;
    expect(computeAudioLevel(data)).toBeCloseTo(1, 1);
  });
  it("returns a value strictly between 0 and 1 for a moderate real signal", () => {
    const data = new Uint8Array(64);
    for (let i = 0; i < data.length; i++) data[i] = 128 + Math.round(40 * Math.sin(i));
    const level = computeAudioLevel(data);
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan(1);
  });
  it("returns 0 for an empty buffer instead of throwing (division-by-zero guard)", () => {
    expect(computeAudioLevel(new Uint8Array(0))).toBe(0);
  });
  it("never exceeds 1 even for out-of-range-looking input", () => {
    const data = new Uint8Array(8).fill(255);
    expect(computeAudioLevel(data)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// cleanup.ts: stopAllTracks — spec's literal, checkable requirement: "never
// declare a track was stopped without verifying readyState === 'ended'"
// ---------------------------------------------------------------------------
describe("media/cleanup.ts: stopAllTracks", () => {
  it("returns true when every track really reaches readyState 'ended' after stop()", () => {
    const stream = fakeStream([fakeTrack("ended"), fakeTrack("ended")]);
    expect(stopAllTracks(stream)).toBe(true);
  });

  it("returns false, not a false positive, when a track's stop() doesn't actually reach 'ended'", () => {
    const stream = fakeStream([fakeTrack("ended"), fakeTrack("live")]);
    expect(stopAllTracks(stream)).toBe(false);
  });

  it("calls stop() on every track exactly once", () => {
    const t1 = fakeTrack("ended");
    const t2 = fakeTrack("ended");
    const stopSpy1 = vi.spyOn(t1, "stop");
    const stopSpy2 = vi.spyOn(t2, "stop");
    stopAllTracks(fakeStream([t1, t2]));
    expect(stopSpy1).toHaveBeenCalledTimes(1);
    expect(stopSpy2).toHaveBeenCalledTimes(1);
  });

  it("treats a null/undefined stream as already cleaned up (true), never throwing", () => {
    expect(stopAllTracks(null)).toBe(true);
    expect(stopAllTracks(undefined)).toBe(true);
  });
});

describe("media/cleanup.ts: performMediaCleanup", () => {
  it("stops every stream, revokes every registry, stops a live recorder, and terminates FFmpeg — the full teardown checklist in one call", () => {
    const registry = { revokeAll: vi.fn() };
    const recorder = { state: "recording", stop: vi.fn() } as unknown as MediaRecorder;
    const terminateFfmpeg = vi.fn();
    const stream = fakeStream([fakeTrack("ended")]);

    const result = performMediaCleanup({ streams: [stream], objectUrls: [registry], mediaRecorder: recorder, terminateFfmpeg });

    expect(result.allTracksStopped).toBe(true);
    expect(registry.revokeAll).toHaveBeenCalledTimes(1);
    expect((recorder as unknown as { stop: () => void }).stop).toHaveBeenCalledTimes(1);
    expect(terminateFfmpeg).toHaveBeenCalledTimes(1);
  });

  it("does not call stop() on an already-inactive recorder", () => {
    const recorder = { state: "inactive", stop: vi.fn() } as unknown as MediaRecorder;
    performMediaCleanup({ mediaRecorder: recorder });
    expect((recorder as unknown as { stop: () => void }).stop).not.toHaveBeenCalled();
  });

  it("reports allTracksStopped: false when a stream's track fails to reach 'ended', without throwing or skipping the rest of cleanup", () => {
    const registry = { revokeAll: vi.fn() };
    const stuckStream = fakeStream([fakeTrack("live")]);
    const result = performMediaCleanup({ streams: [stuckStream], objectUrls: [registry] });
    expect(result.allTracksStopped).toBe(false);
    expect(registry.revokeAll).toHaveBeenCalledTimes(1); // rest of cleanup still runs
  });

  it("tolerates an empty/no-op call with no targets", () => {
    expect(performMediaCleanup({})).toEqual({ allTracksStopped: true });
  });
});
