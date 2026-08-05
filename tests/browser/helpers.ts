import path from "node:path";
import type { Page, Request } from "@playwright/test";

export const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/media");

export function fixture(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

/** Tracks every network request the page makes so tests can assert no CDN/external traffic occurred. */
export function trackRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (req) => requests.push(req));
  return requests;
}

export function assertNoExternalMediaTraffic(requests: Request[], baseUrl: string) {
  const origin = new URL(baseUrl).origin;
  const offenders = requests.filter((r) => {
    const url = r.url();
    if (url.startsWith(origin)) return false;
    if (url.startsWith("data:") || url.startsWith("blob:")) return false;
    return /ffmpeg|jsdelivr|unpkg|githubusercontent|wasm/i.test(url);
  });
  return offenders.map((r) => r.url());
}

/** Collects console errors/pageerrors/failed requests so tests can assert none occurred during real FFmpeg/MediaRecorder execution. */
export function trackPageProblems(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("requestfailed", (req) => failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`));
  return { consoleErrors, pageErrors, failedRequests };
}

/**
 * `getDisplayMedia()` has no Chromium fake-device flag equivalent to
 * `getUserMedia`'s (there is no real screen to capture in headless CI), and
 * the corrective spec explicitly allows a controlled mock for it here — but
 * requires "a real MediaStream or a faithful implementation with
 * controllable tracks", not a bare stub. This installs one before any app
 * script runs: a genuine `MediaStream` backed by a real animated
 * `<canvas>.captureStream()` video track (plus a real Web Audio oscillator
 * track when audio is requested), with a real, independently-stoppable
 * `MediaStreamTrack` — so `screen-recorder-tool.tsx`'s own track-management,
 * `onended` handling, and MediaRecorder pipeline all run unmodified against
 * a real stream, only the *source* of the video is swapped for a canvas
 * instead of the OS screen picker (which cannot exist headlessly).
 */
export async function mockGetDisplayMedia(page: Page) {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
    (navigator.mediaDevices as unknown as { getDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia }).getDisplayMedia = async (
      constraints?: DisplayMediaStreamOptions
    ) => {
      void original;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d")!;
      let frame = 0;
      const draw = () => {
        ctx.fillStyle = `hsl(${(frame * 4) % 360}, 70%, 50%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        frame++;
      };
      draw();
      const interval = setInterval(draw, 1000 / 30);
      const canvasStream = (canvas as unknown as { captureStream: (fps: number) => MediaStream }).captureStream(30);
      const [videoTrack] = canvasStream.getVideoTracks();
      const originalStop = videoTrack.stop.bind(videoTrack);
      videoTrack.stop = () => {
        clearInterval(interval);
        originalStop();
        // Real hardware-sourced tracks (a real camera/screen-share ending) reliably fire `ended`
        // on stop() — confirmed real Chromium behavior the app's videoTrack.onended handler relies
        // on. A canvas.captureStream() track does NOT reliably dispatch that event on stop() in
        // this Chromium build (verified empirically: readyState flips to "ended" but no event
        // fires) — a quirk of the synthetic source, not of the real getDisplayMedia() contract this
        // mock stands in for. Dispatching it explicitly makes the mock "a faithful implementation
        // with controllable tracks" as required, without touching the app's own handler logic.
        videoTrack.dispatchEvent(new Event("ended"));
      };

      const tracks: MediaStreamTrack[] = [videoTrack];
      if (constraints && constraints.audio) {
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        osc.frequency.value = 330;
        const dest = audioCtx.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        tracks.push(...dest.stream.getAudioTracks());
      }
      const stream = new MediaStream(tracks);
      // Exposed so tests can simulate the visitor stopping the share from the
      // browser's own native UI (never reachable by clicking the app itself).
      (window as unknown as { __mockedDisplayStream?: MediaStream }).__mockedDisplayStream = stream;
      return stream;
    };
  });
}
