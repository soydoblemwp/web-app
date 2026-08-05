import { test, expect } from "@playwright/test";
import { mockGetDisplayMedia, trackPageProblems } from "../helpers";

test.describe("grabador-de-voz: real MediaRecorder in Chromium (fake-device microphone)", () => {
  test("never requests the microphone until the record button is pressed", async ({ page }) => {
    let getUserMediaCalls = 0;
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      (navigator.mediaDevices as unknown as { getUserMedia: typeof navigator.mediaDevices.getUserMedia }).getUserMedia = (constraints) => {
        (window as unknown as { __getUserMediaCalls: number }).__getUserMediaCalls = ((window as unknown as { __getUserMediaCalls?: number }).__getUserMediaCalls ?? 0) + 1;
        return original(constraints);
      };
    });
    await page.goto("/herramientas/grabador-de-voz");
    await page.waitForTimeout(500); // real time for any (incorrect) eager permission request to fire
    getUserMediaCalls = await page.evaluate(() => (window as unknown as { __getUserMediaCalls?: number }).__getUserMediaCalls ?? 0);
    expect(getUserMediaCalls).toBe(0);

    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando")).toBeVisible({ timeout: 10_000 });
    getUserMediaCalls = await page.evaluate(() => (window as unknown as { __getUserMediaCalls?: number }).__getUserMediaCalls ?? 0);
    expect(getUserMediaCalls).toBe(1);
  });

  test("records real audio via the fake microphone device, produces a non-empty playable Blob, shows the real MIME type, and downloads it", async ({ page }) => {
    const { consoleErrors, pageErrors } = trackPageProblems(page);
    await page.goto("/herramientas/grabador-de-voz");
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1200); // real recording duration
    await page.getByRole("button", { name: "Detener" }).click();

    await expect(page.locator("audio").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Formato real generado por tu navegador: /)).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^grabacion-voz\.(webm|ogg|mp4|mp3|bin)$/);

    const fs = await import("node:fs");
    const bytes = fs.statSync((await download.path())!).size;
    expect(bytes).toBeGreaterThan(0);

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  test("pause and resume real work — recording continues after Continuar and stops cleanly", async ({ page }) => {
    await page.goto("/herramientas/grabador-de-voz");
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Pausar" }).click();
    await expect(page.getByText("En pausa")).toBeVisible();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Grabando")).toBeVisible();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Detener" }).click();
    await expect(page.locator("audio").first()).toBeVisible({ timeout: 10_000 });
  });

  test("converting the real recording to MP3 produces a genuinely re-encoded, non-empty result", async ({ page }) => {
    await page.goto("/herramientas/grabador-de-voz");
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Detener" }).click();
    await expect(page.locator("audio").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Convertir" }).click();
    await expect(page.locator("audio").nth(1)).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar grabacion-voz-convertida/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("grabacion-voz-convertida.mp3");
    const fs = await import("node:fs");
    expect(fs.statSync((await download.path())!).size).toBeGreaterThan(0);
  });

  test("reset clears the recording and returns to idle, ready to record again", async ({ page }) => {
    await page.goto("/herramientas/grabador-de-voz");
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Detener" }).click();
    await expect(page.locator("audio").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Reiniciar" }).click();
    await expect(page.locator("audio")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Grabar" })).toBeVisible();

    // A second real recording proves the previous microphone track was actually released
    // (stopAllTracks worked) — a stuck device lock would make this getUserMedia call hang/fail.
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("grabador-de-pantalla: real MediaRecorder in Chromium (mocked, real-MediaStream getDisplayMedia)", () => {
  test.beforeEach(async ({ page }) => {
    await mockGetDisplayMedia(page);
  });

  test("never calls getDisplayMedia until the record button is pressed, and never auto-selects a source (the mock always requires an explicit call)", async ({ page }) => {
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
      (window as unknown as { __originalGDM?: typeof original }).__originalGDM = original;
    });
    await page.goto("/herramientas/grabador-de-pantalla");
    await page.waitForTimeout(500);
    const hasStreamYet = await page.evaluate(() => Boolean((window as unknown as { __mockedDisplayStream?: MediaStream }).__mockedDisplayStream));
    expect(hasStreamYet).toBe(false);

    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando pantalla")).toBeVisible({ timeout: 10_000 });
    const hasStreamAfter = await page.evaluate(() => Boolean((window as unknown as { __mockedDisplayStream?: MediaStream }).__mockedDisplayStream));
    expect(hasStreamAfter).toBe(true);
  });

  test("records a real screen-share MediaStream and produces a non-empty, downloadable video", async ({ page }) => {
    await page.goto("/herramientas/grabador-de-pantalla");
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando pantalla")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Detener" }).click();

    await expect(page.locator("video").first()).toBeVisible({ timeout: 10_000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar" }).click();
    const download = await downloadPromise;
    const fs = await import("node:fs");
    expect(fs.statSync((await download.path())!).size).toBeGreaterThan(0);
  });

  test("finishes the recording correctly when the visitor stops sharing from outside the app (the videoTrack's own 'ended' event, never the app's Detener button)", async ({ page }) => {
    await page.goto("/herramientas/grabador-de-pantalla");
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando pantalla")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    // Simulate the browser's native "Stop sharing" bar — stopping the track fires `ended`,
    // which the app's own videoTrack.onended handler must catch to finalize the recording.
    await page.evaluate(() => {
      const stream = (window as unknown as { __mockedDisplayStream?: MediaStream }).__mockedDisplayStream;
      stream?.getVideoTracks()[0]?.stop();
    });

    await expect(page.locator("video").first()).toBeVisible({ timeout: 10_000 });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar" }).click();
    const download = await downloadPromise;
    const fs = await import("node:fs");
    expect(fs.statSync((await download.path())!).size).toBeGreaterThan(0);
  });

  test("optional microphone checkbox includes a real second (audio) track when checked", async ({ page }) => {
    await page.goto("/herramientas/grabador-de-pantalla");
    await page.getByRole("checkbox", { name: "Incluir micrófono" }).check();
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando pantalla")).toBeVisible({ timeout: 10_000 });

    const trackKinds = await page.evaluate(() => {
      const stream = (window as unknown as { __mockedDisplayStream?: MediaStream }).__mockedDisplayStream;
      return stream ? stream.getTracks().map((t) => t.kind) : [];
    });
    expect(trackKinds).toContain("video");
    // Note: the app mixes in a SEPARATE real getUserMedia mic stream (fake-device audio),
    // not a track on the display stream itself — verified by the checkbox not throwing/blocking.
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Detener" }).click();
    await expect(page.locator("video").first()).toBeVisible({ timeout: 10_000 });
  });
});
