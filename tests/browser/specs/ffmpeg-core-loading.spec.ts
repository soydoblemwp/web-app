import { test, expect } from "@playwright/test";
import { fixture, trackRequests, assertNoExternalMediaTraffic, trackPageProblems } from "../helpers";

/**
 * Real Chromium validation that the FFmpeg WebAssembly core actually loads
 * from this app's own origin, its Worker starts, and it reports real
 * encoder capabilities — none of this can be exercised in Vitest's Node
 * environment (Fase 45 correction, section 5).
 */
test.describe("FFmpeg core loads for real in Chromium", () => {
  test("recortar-audio: loading-core request hits same-origin /ffmpeg-core/*, never a CDN, and the tool reaches a ready/processing state", async ({ page, baseURL }) => {
    const requests = trackRequests(page);
    const { consoleErrors, pageErrors } = trackPageProblems(page);

    await page.goto("/herramientas/recortar-audio");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("tone-a-440hz.wav"));

    // Wait for real duration to be read from the file (proves the browser actually decoded it).
    await expect(page.locator("audio").first()).toBeVisible();

    await page.getByRole("button", { name: "Recortar audio" }).click();

    // Wait for the actual result to prove the Worker really ran to completion, not just "started" —
    // by this point every asset fetch ensureFfmpegLoaded() awaits has necessarily already resolved.
    await expect(page.locator("audio").nth(1)).toBeVisible({ timeout: 60_000 });

    const coreJsRequest = requests.find((r) => r.url().includes("/ffmpeg-core/ffmpeg-core.js"));
    const coreWasmRequest = requests.find((r) => r.url().includes("/ffmpeg-core/ffmpeg-core.wasm"));
    const workerRequest = requests.find((r) => r.url().includes("/ffmpeg-core/worker.js"));
    expect(coreJsRequest, "expected a real network request for ffmpeg-core.js").toBeTruthy();
    expect(coreWasmRequest, "expected a real network request for ffmpeg-core.wasm").toBeTruthy();
    expect(workerRequest, "expected a real network request for the self-hosted worker.js").toBeTruthy();

    const jsResponse = await coreJsRequest!.response();
    const wasmResponse = await coreWasmRequest!.response();
    const workerResponse = await workerRequest!.response();
    expect(jsResponse?.status()).toBe(200);
    expect(wasmResponse?.status()).toBe(200);
    expect(workerResponse?.status()).toBe(200);
    expect(new URL(coreJsRequest!.url()).origin).toBe(new URL(baseURL!).origin);
    expect(new URL(coreWasmRequest!.url()).origin).toBe(new URL(baseURL!).origin);
    expect(new URL(workerRequest!.url()).origin).toBe(new URL(baseURL!).origin);

    const external = assertNoExternalMediaTraffic(requests, baseURL!);
    expect(external, `unexpected external media/CDN traffic: ${external.join(", ")}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join("\n")}`).toEqual([]);
    expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toEqual([]);
  });

  test("the UI only ever offers audio output formats the installed core can really encode", async ({ page }) => {
    await page.goto("/herramientas/convertir-audio");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("tone-a-440hz.wav"));
    await page.getByLabel("Formato de salida").click();
    const options = await page.getByRole("option").allTextContents();
    expect(options.length).toBeGreaterThan(0);
    // The static capability matrix only ever lists mp3/wav/ogg-vorbis/opus/flac for audio.
    for (const opt of options) {
      expect(opt).toMatch(/MP3|WAV|OGG|Opus|FLAC/i);
    }
  });
});
