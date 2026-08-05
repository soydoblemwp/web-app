import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getFfmpegState, cancelFfmpegJob, runFfmpegJob, resetFfmpegManager, terminateFfmpeg } from "@/lib/public-tools/media/ffmpeg-client";

/**
 * Real Chromium testing (tests/browser/specs/cancellation-and-cleanup.spec.ts)
 * found and fixed a genuine bug: cancelling while FFmpeg was still loading
 * (`instance` still null) did nothing, because the in-flight
 * ensureFfmpegLoaded() call finished anyway and silently promoted itself to
 * "ready" — the browser test is the only way to exercise the fix end-to-end,
 * since `@ffmpeg/ffmpeg` cannot construct in Node (its package.json "node"
 * condition maps to a stub that throws). What IS real and Node-testable is
 * the module's state-machine behavior in every state reachable without a
 * live instance, plus source-level regression guards so the fix itself
 * (and the two sibling fixes from the same correction) can't silently
 * regress without a test noticing.
 */
describe("media/ffmpeg-client.ts: state machine (states reachable without a live @ffmpeg/ffmpeg instance)", () => {
  it("starts unloaded", () => {
    expect(getFfmpegState()).toBe("unloaded");
  });

  it("cancelFfmpegJob() is a real no-op outside processing/loading-core/initializing — never invents a fake cancellation", () => {
    resetFfmpegManager();
    expect(getFfmpegState()).toBe("unloaded");
    cancelFfmpegJob();
    expect(getFfmpegState()).toBe("unloaded");
  });

  it("runFfmpegJob() refuses to run without a ready, live instance — returns a real ffmpeg-load-failed error, never silently proceeds", async () => {
    resetFfmpegManager();
    const result = await runFfmpegJob(["-i", "in.mp3", "out.mp3"]);
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe("ffmpeg-load-failed");
  });

  it("terminateFfmpeg() is safe to call repeatedly and always leaves state 'terminated'", () => {
    terminateFfmpeg();
    expect(getFfmpegState()).toBe("terminated");
    terminateFfmpeg();
    expect(getFfmpegState()).toBe("terminated");
  });

  it("resetFfmpegManager() returns to 'unloaded' after termination, allowing a fresh load attempt", () => {
    terminateFfmpeg();
    resetFfmpegManager();
    expect(getFfmpegState()).toBe("unloaded");
  });
});

describe("media/ffmpeg-client.ts: regression guards for the Fase 45 browser-correction fixes", () => {
  const source = fs.readFileSync("src/lib/public-tools/media/ffmpeg-client.ts", "utf8");

  it("real bug fix #1: passes classWorkerURL to ffmpeg.load() — without it, @ffmpeg/ffmpeg's default relative Worker bootstrap (new Worker(new URL('./worker.js', import.meta.url))) is unresolvable under Turbopack and throws 'Cannot find module as expression is too dynamic' at runtime (confirmed via real Chromium testing)", () => {
    expect(source).toMatch(/classWorkerURL/);
    expect(source).toMatch(/next\.load\(\{[^}]*classWorkerURL/);
  });

  it("real bug fix #2: cancelling while the core is still loading (no live instance yet) sets a flag that ensureFfmpegLoaded() checks after next.load() resolves, instead of silently promoting the freshly-loaded instance to ready and running the job the visitor already cancelled", () => {
    expect(source).toMatch(/cancelRequestedDuringLoad/);
    // The flag must be checked AFTER load() succeeds and BEFORE the instance is promoted to `instance = next`.
    const loadIndex = source.indexOf("await next.load(");
    const checkIndex = source.indexOf("if (cancelRequestedDuringLoad)");
    const promoteIndex = source.indexOf("instance = next;");
    expect(loadIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeGreaterThan(loadIndex);
    expect(promoteIndex).toBeGreaterThan(checkIndex);
  });

  it("real bug fix #3 (dead-code correction): runFfmpegJob checks for state 'cancelled', not the ephemeral 'cancelling' that cancelFfmpegJob() never actually leaves observable to a caller (it synchronously advances state all the way to 'cancelled' before returning)", () => {
    expect(source).toMatch(/state as FfmpegManagerState\) === "cancelled"/);
  });

  it("@ffmpeg/util's toBlobURL() Object URLs are tracked and explicitly revoked on both cancellation and termination — a real Chromium test (URL.createObjectURL/revokeObjectURL instrumented) caught them never being revoked anywhere before this fix", () => {
    expect(source).toMatch(/revokeLoadedAssetBlobUrls/);
    const cancelFnBody = source.slice(source.indexOf("export function cancelFfmpegJob"), source.indexOf("export function terminateFfmpeg"));
    const terminateFnBody = source.slice(source.indexOf("export function terminateFfmpeg"));
    expect(cancelFnBody).toMatch(/revokeLoadedAssetBlobUrls\(\)/);
    expect(terminateFnBody).toMatch(/revokeLoadedAssetBlobUrls\(\)/);
  });
});

describe("media-time-range.tsx: regression guard for the prop-sync fix", () => {
  it("real bug fix: startMs/endMs prop changes (e.g. once async video/audio duration finishes loading) are synced into the displayed text fields using React's own 'adjust state during render' pattern (never inside a useEffect, per this project's react-hooks/set-state-in-effect lint rule) — without this, a real Chromium test caught the 'Final' field staying stuck at its initial value (usually 00:00.000) even though the real startMs/endMs used for processing were already correct", () => {
    const source = fs.readFileSync("src/components/public-tools/media-time-range.tsx", "utf8");
    expect(source).toMatch(/if \(startMs !== prevStartMs\)/);
    expect(source).toMatch(/if \(endMs !== prevEndMs\)/);
    expect(source).not.toMatch(/useEffect/); // must not be a useEffect+setState (flagged by this project's lint rule, and re-introduces the bug's timing)
  });
});

describe("voice-recorder-tool.tsx / screen-recorder-tool.tsx: regression guard for the SSR hydration-mismatch fix", () => {
  it("real bug fix: both recorder tools render a fixed 'idle' initial state (matching what the server renders) and read the real browser-support check via useSyncExternalStore — a server snapshot of 'supported' (matching the SSR-rendered 'idle' UI) plus the real client value applied with no extra render pass. Evaluating the check directly in the useState initializer instead (the original bug) produced a different first-render result on the server vs. client hydration, which real Chromium testing caught as an actual React hydration error (#418); a useEffect+setState 'fix' would have re-introduced a real lint error in this project (react-hooks/set-state-in-effect) for the same underlying reason — cascading renders instead of a hydration mismatch", () => {
    const voiceSource = fs.readFileSync("src/components/public-tools/tools/voice-recorder-tool.tsx", "utf8");
    const screenSource = fs.readFileSync("src/components/public-tools/tools/screen-recorder-tool.tsx", "utf8");
    expect(voiceSource).toMatch(/useState<RecorderStatus>\("idle"\)/);
    expect(voiceSource).toMatch(/useSyncExternalStore\(neverSubscribe, isMediaRecorderSupported, \(\) => true\)/);
    expect(screenSource).toMatch(/useState<RecorderStatus>\("idle"\)/);
    expect(screenSource).toMatch(/useSyncExternalStore\(neverSubscribe, \(\) => isDisplayMediaSupported\(\) && isMediaRecorderSupported\(\), \(\) => true\)/);
  });
});

describe("audio.ts: regression guard for the trim-copy-vs-transcode fix", () => {
  it("real bug fix: trimAudio() only attempts a real stream copy when the requested output format's extension actually matches the source's — a real Chromium test caught a WAV trimmed with a requested MP3 output producing an empty file, because '-c copy' cannot mux raw PCM into an MP3 container; the output must always be named/labeled from what the bytes actually are (actualExtension), never blindly from the request", () => {
    const source = fs.readFileSync("src/lib/public-tools/media/audio.ts", "utf8");
    expect(source).toMatch(/canCopy/);
    expect(source).toMatch(/requestedExt\.toLowerCase\(\) === input\.extension\.toLowerCase\(\)/);
    expect(source).toMatch(/actualExtension/);
  });
});

describe("metadata.ts: regression guard for the detectHasAudio false-negative/false-positive fixes", () => {
  it("real bug fix: webkitAudioDecodedByteCount is only trusted as evidence of ABSENCE after a real forced-decode attempt (trustZeroByteCount), never on the very first check — a real Chromium test caught a video WITH a genuine audio track being reported as having none, because the byte count is always 0 before anything has been decoded", () => {
    const source = fs.readFileSync("src/lib/public-tools/media/metadata.ts", "utf8");
    expect(source).toMatch(/trustZeroByteCount/);
    expect(source).toMatch(/readVendorAudioFlags\(el, false\)/); // initial check: don't trust a zero yet
    expect(source).toMatch(/readVendorAudioFlags\(el, true\)/); // after a real decode attempt: trust it
  });
});
