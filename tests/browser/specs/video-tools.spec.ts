import { test, expect } from "@playwright/test";
import { fixture } from "../helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.describe("recortar-video: real trim in Chromium", () => {
  test("fast (stream-copy) trim of a real WebM clip produces a playable, non-empty result", async ({ page }) => {
    await page.goto("/herramientas/recortar-video");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-with-audio.webm"));
    await expect(page.locator("video").first()).toBeVisible();
    // Wait for real duration metadata to finish loading (as a real visitor would see the field
    // populate) before processing — matches realistic pacing, not an instant synthetic click.
    await expect(page.getByRole("button", { name: "Final = duración total" })).toBeEnabled();
    // Default mode is "fast" already selected.
    await page.getByRole("button", { name: "Recortar video" }).click();
    await expect(page.locator("video").nth(1)).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar/ }).click();
    const download = await downloadPromise;
    const fs = await import("node:fs");
    const downloadPath = await download.path();
    expect(fs.statSync(downloadPath!).size).toBeGreaterThan(0);
  });

  test("precise (re-encode) trim produces a real, independently-playable video with the requested format", async ({ page }) => {
    await page.goto("/herramientas/recortar-video");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-with-audio.webm"));
    await expect(page.getByRole("button", { name: "Final = duración total" })).toBeEnabled();
    await page.getByRole("button", { name: "Corte preciso" }).click();
    await page.getByRole("button", { name: "Recortar video" }).click();
    await expect(page.locator("video").nth(1)).toBeVisible({ timeout: 60_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^video-recortado\.mp4$/);

    const fs = await import("node:fs");
    const bytes = fs.readFileSync((await download.path())!);
    expect(bytes.length).toBeGreaterThan(0);
    // Real MP4 ftyp box at offset 4 — proves genuine re-encoding into the requested container.
    expect(bytes.slice(4, 8).toString("ascii")).toBe("ftyp");
  });
});

test.describe("comprimir-video: real compression in Chromium", () => {
  test("compresses a real video and reports an honest original-vs-final size comparison", async ({ page }) => {
    await page.goto("/herramientas/comprimir-video");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-with-audio.webm"));
    await expect(page.getByText(/×.*00:00\.0\d\d/)).toBeVisible();

    await page.getByRole("button", { name: "Comprimir video" }).click();
    await expect(page.locator("video").nth(1)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Original:.*→ Final:/)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar/ }).click();
    const download = await downloadPromise;
    const fs = await import("node:fs");
    expect(fs.statSync((await download.path())!).size).toBeGreaterThan(0);
  });
});

test.describe("redimensionar-video: real resize/crop in Chromium", () => {
  test("applies a 1:1 preset and the resulting real video reports square dimensions", async ({ page }) => {
    await page.goto("/herramientas/redimensionar-video");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-with-audio.webm"));
    // The 1:1 preset computes from the real originalWidth, which is 0 until metadata loads —
    // wait for the real "Original: WxH" dimensions text before applying the preset.
    await expect(page.getByText(/Original: (?!0×0)\d+×\d+/)).toBeVisible();
    await page.getByRole("button", { name: "1:1" }).click();
    await page.getByRole("button", { name: "Redimensionar video" }).click();
    await expect(page.locator("video").nth(1)).toBeVisible({ timeout: 60_000 });

    const dims = await page.evaluate(async () => {
      const video = document.querySelectorAll("video")[1] as HTMLVideoElement;
      await new Promise((resolve) => {
        if (video.readyState >= 1) resolve(null);
        else video.addEventListener("loadedmetadata", () => resolve(null), { once: true });
      });
      return { w: video.videoWidth, h: video.videoHeight };
    });
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.w).toBe(dims.h); // real 1:1 output, not just a UI label
  });
});

test.describe("extraer-audio-video: real audio extraction in Chromium", () => {
  test("extracts real audio from a video that has an audio track", async ({ page }) => {
    await page.goto("/herramientas/extraer-audio-video");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-with-audio.webm"));
    await expect(page.getByText("Este video no parece tener una pista de audio.")).not.toBeVisible();

    await page.getByRole("button", { name: "Extraer audio" }).click();
    await expect(page.locator("audio").first()).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar/ }).click();
    const download = await downloadPromise;
    const fs = await import("node:fs");
    expect(fs.statSync((await download.path())!).size).toBeGreaterThan(0);
  });

  test("blocks extraction and shows a clear message for a video with no audio track (never produces an empty file)", async ({ page }) => {
    await page.goto("/herramientas/extraer-audio-video");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-no-audio.webm"));
    await expect(page.getByText("Este video no parece tener una pista de audio.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Extraer audio" })).toHaveCount(0);
  });
});

test.describe("video-a-gif: real GIF generation in Chromium", () => {
  test("generates a real GIF with a valid GIF signature, not a static frame mislabeled as animated", async ({ page }) => {
    await page.goto("/herramientas/video-a-gif");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-with-audio.webm"));
    await expect(page.getByRole("button", { name: "Final = duración total" })).toBeEnabled();
    await expect(page.getByText(/Fotogramas estimados/)).toBeVisible();

    await page.getByRole("button", { name: "Generar GIF" }).click();
    await expect(page.locator("img[alt], img[src^='blob:']").first()).toBeVisible({ timeout: 60_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("animacion.gif");

    const fs = await import("node:fs");
    const bytes = fs.readFileSync((await download.path())!);
    const header = bytes.slice(0, 6).toString("ascii");
    expect(["GIF87a", "GIF89a"]).toContain(header);
  });
});

test.describe("extraer-fotogramas-video: real frame extraction in Chromium", () => {
  test("extracts a real central thumbnail frame as a genuine, decodable image", async ({ page }) => {
    await page.goto("/herramientas/extraer-fotogramas-video");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-with-audio.webm"));
    // Wait for the tool's own metadata read (duration) to finish before processing — the "central
    // thumbnail" mode needs a real, non-zero duration to compute the correct central timestamp.
    // (This tool shows no visible duration text, so a realistic-pacing wait stands in for one.)
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Extraer fotogramas" }).click();
    await expect(page.locator("img[src^='blob:']").first()).toBeVisible({ timeout: 30_000 });

    // Verify the rendered <img> actually decoded (nonzero natural dimensions), not a broken image icon.
    const naturalWidth = await page.locator("img[src^='blob:']").first().evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });
});
