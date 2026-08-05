/**
 * One-time generator for small, original, purpose-built media fixtures used
 * by the Fase 45 browser tests (tests/browser/specs/*.spec.ts). Run with:
 *
 *   node tests/fixtures/media/generate.mjs
 *
 * Audio fixtures are pure Node math (no browser needed). Video fixtures are
 * produced by driving a real Chromium instance (via Playwright) to animate a
 * <canvas>, capture it with canvas.captureStream(), optionally mix in a real
 * Web Audio oscillator track, and record the result with the browser's own
 * native MediaRecorder — the same API the app's recorder tools use. This
 * avoids requiring a system FFmpeg binary just to produce test fixtures.
 *
 * Plain .mjs (not .ts run through tsx/esbuild) — esbuild's function-name
 * preservation transform injects a `__name()` helper call that breaks when
 * Playwright serializes the function body alone for page.evaluate().
 *
 * No large or third-party media is used — every fixture is synthetic and a
 * few seconds long at most.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

function buildWavFile({ freqHz, durationSec, sampleRate = 8000 }) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = freqHz === null ? 0 : Math.round(Math.sin(2 * Math.PI * freqHz * t) * 0.5 * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

function generateAudioFixtures() {
  writeFileSync(path.join(OUT_DIR, "tone-a-440hz.wav"), buildWavFile({ freqHz: 440, durationSec: 2 }));
  writeFileSync(path.join(OUT_DIR, "tone-b-880hz.wav"), buildWavFile({ freqHz: 880, durationSec: 1.5 }));
  writeFileSync(path.join(OUT_DIR, "silence.wav"), buildWavFile({ freqHz: null, durationSec: 1 }));
  console.log("Wrote tone-a-440hz.wav, tone-b-880hz.wav, silence.wav");
}

function generateTextFixtures() {
  const srt = `1
00:00:00,000 --> 00:00:01,500
Primer subtitulo de prueba

2
00:00:01,500 --> 00:00:03,000
Segundo subtitulo de prueba
`;
  const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.500
Primer subtitulo de prueba

00:00:01.500 --> 00:00:03.000
Segundo subtitulo de prueba
`;
  writeFileSync(path.join(OUT_DIR, "sample.srt"), srt, "utf8");
  writeFileSync(path.join(OUT_DIR, "sample.vtt"), vtt, "utf8");

  const corrupted = Buffer.from([0x00, 0x11, 0x99, 0xff, 0x42, 0x13, 0x37, 0x00, 0x01, 0x02, 0x03, 0x04, 0x9a, 0xbc, 0xde, 0xf0]);
  writeFileSync(path.join(OUT_DIR, "corrupted.wav"), corrupted);

  writeFileSync(path.join(OUT_DIR, "misleading-extension.mp4"), buildWavFile({ freqHz: 300, durationSec: 0.5 }));

  console.log("Wrote sample.srt, sample.vtt, corrupted.wav, misleading-extension.mp4");
}

function recorderPageHtml(width, height) {
  return `<!doctype html><html><body><canvas id="c" width="${width}" height="${height}"></canvas></body></html>`;
}

async function recordCanvasClip({ withAudio, durationMs, width = 160, height = 120 }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(recorderPageHtml(width, height));
    const base64 = await page.evaluate(
      async ({ withAudio, durationMs }) => {
        const canvas = document.getElementById("c");
        const ctx = canvas.getContext("2d");
        let frame = 0;
        const draw = () => {
          const hue = (frame * 6) % 360;
          ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(80 + Math.sin(frame / 5) * 40, 60 + Math.cos(frame / 5) * 30, 15, 0, Math.PI * 2);
          ctx.fill();
          frame++;
        };
        const drawInterval = setInterval(draw, 1000 / 30);
        draw();

        const canvasStream = canvas.captureStream(30);
        let combined = canvasStream;
        let audioCtx = null;
        if (withAudio) {
          audioCtx = new AudioContext();
          const osc = audioCtx.createOscillator();
          osc.frequency.value = 220;
          const dest = audioCtx.createMediaStreamDestination();
          osc.connect(dest);
          osc.start();
          combined = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        }

        const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
        const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
        const recorder = new MediaRecorder(combined, { mimeType });
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        const stopped = new Promise((resolve) => {
          recorder.onstop = () => resolve();
        });
        recorder.start();
        await new Promise((r) => setTimeout(r, durationMs));
        recorder.stop();
        await stopped;

        clearInterval(drawInterval);
        for (const track of combined.getTracks()) track.stop();
        if (audioCtx) await audioCtx.close();

        const blob = new Blob(chunks, { type: mimeType });
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      },
      { withAudio, durationMs }
    );
    return Buffer.from(base64, "base64");
  } finally {
    await browser.close();
  }
}

async function generateVideoFixtures() {
  const withAudio = await recordCanvasClip({ withAudio: true, durationMs: 2000 });
  writeFileSync(path.join(OUT_DIR, "clip-with-audio.webm"), withAudio);
  console.log(`Wrote clip-with-audio.webm (${withAudio.length} bytes)`);

  const withoutAudio = await recordCanvasClip({ withAudio: false, durationMs: 2000 });
  writeFileSync(path.join(OUT_DIR, "clip-no-audio.webm"), withoutAudio);
  console.log(`Wrote clip-no-audio.webm (${withoutAudio.length} bytes)`);

  // Longer + higher-resolution than the other clips — used only to give a real FFmpeg video
  // compression job enough wall-clock time to reliably cancel mid-flight in the cancellation test.
  const longClip = await recordCanvasClip({ withAudio: true, durationMs: 8000, width: 640, height: 480 });
  writeFileSync(path.join(OUT_DIR, "clip-long-for-cancel-test.webm"), longClip);
  console.log(`Wrote clip-long-for-cancel-test.webm (${longClip.length} bytes)`);
}

async function main() {
  generateAudioFixtures();
  generateTextFixtures();
  await generateVideoFixtures();
  console.log("All fixtures generated in " + OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
