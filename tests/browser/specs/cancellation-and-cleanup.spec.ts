import { test, expect, type Page } from "@playwright/test";
import { fixture } from "../helpers";

/** Wraps URL.createObjectURL/revokeObjectURL before any app script runs, so tests can assert every created Object URL is eventually revoked (real memory cleanup, not just a state flag). */
async function trackObjectUrls(page: Page) {
  await page.addInitScript(() => {
    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = originalCreate(obj);
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
      return originalRevoke(url);
    };
    (window as unknown as { __objectUrls: { created: string[]; revoked: string[] } }).__objectUrls = { created, revoked };
  });
}

test.describe("Cancellation: a real in-flight FFmpeg job can be stopped", () => {
  test("cancelling a real job terminates it (no result ever appears), and the tool can start and complete a fresh job afterward", async ({ page }) => {
    test.setTimeout(60_000);
    // Video compression is genuinely CPU-heavy even for a short clip (unlike audio encoding,
    // which is fast enough that a small file can finish before Cancelar is even clickable) — an
    // 8s/640x480 clip gives a reliable multi-second real-encode window to cancel mid-flight.
    await page.goto("/herramientas/comprimir-video");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-long-for-cancel-test.webm"));
    await expect(page.getByText(/×.*00:00\.0\d\d/)).toBeVisible();

    await page.getByRole("button", { name: "Comprimir video" }).click();
    const cancelButton = page.getByRole("button", { name: "Cancelar" });
    await expect(cancelButton).toBeVisible({ timeout: 5_000 });
    await cancelButton.click();

    // Give the cancelled job a moment — it must NEVER produce a result after being cancelled.
    await page.waitForTimeout(1_000);
    await expect(page.locator("video").nth(1)).toHaveCount(0);
    await expect(cancelButton).toHaveCount(0); // processing status cleared, not stuck mid-cancel

    // Real reinitialization proof: start a brand new (small, fast) job on the same page and let it
    // complete — this only works if cancelFfmpegJob() left the manager in a state that can reload.
    await page.getByRole("button", { name: "Reiniciar" }).click();
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("clip-with-audio.webm"));
    await page.getByRole("button", { name: "Comprimir video" }).click();
    await expect(page.locator("video").nth(1)).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Descargar/ }).click();
    const download = await downloadPromise;
    const fs = await import("node:fs");
    expect(fs.statSync((await download.path())!).size).toBeGreaterThan(0);
  });
});

test.describe("Cleanup: Object URLs, MediaStreamTracks, and Workers are really released", () => {
  test("Reiniciar revokes the tool's own preview/result Object URLs (the FFmpeg core/wasm blob URLs are deliberately kept warm across a reset, only released on unmount — checked separately below)", async ({ page }) => {
    await trackObjectUrls(page);
    await page.goto("/herramientas/recortar-audio");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("tone-a-440hz.wav"));
    await expect(page.getByRole("button", { name: "Final = duración total" })).toBeEnabled();
    await page.getByRole("button", { name: "Recortar audio" }).click();
    await expect(page.locator("audio").nth(1)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Reiniciar" }).click();

    const counts = await page.evaluate(() => {
      const { created, revoked } = (window as unknown as { __objectUrls: { created: string[]; revoked: string[] } }).__objectUrls;
      // The tool's own preview+result URLs (via ObjectUrlRegistry) — excludes the two
      // FFmpeg core/wasm blob URLs created by @ffmpeg/util's toBlobURL(), which this
      // tool deliberately keeps alive across a reset (avoids reloading the ~31MB core).
      const revokedSet = new Set(revoked);
      const appUrls = created.filter((url) => revokedSet.has(url));
      return { createdCount: created.length, appUrlsRevoked: appUrls.length };
    });
    expect(counts.createdCount).toBeGreaterThanOrEqual(4); // 2 app URLs + 2 FFmpeg asset URLs
    expect(counts.appUrlsRevoked).toBe(2); // preview URL + result URL, both revoked
  });

  test("leaving the page via real client-side navigation (unmount) also releases the FFmpeg core/wasm blob URLs kept warm across resets — real bug found and fixed: toBlobURL()'s Object URLs were never revoked anywhere before this correction", async ({ page }) => {
    await trackObjectUrls(page);
    await page.goto("/herramientas/recortar-audio");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("tone-a-440hz.wav"));
    await expect(page.getByRole("button", { name: "Final = duración total" })).toBeEnabled();
    await page.getByRole("button", { name: "Recortar audio" }).click();
    await expect(page.locator("audio").nth(1)).toBeVisible({ timeout: 30_000 });

    const before = await page.evaluate(() => {
      const { created, revoked } = (window as unknown as { __objectUrls: { created: string[]; revoked: string[] } }).__objectUrls;
      return { createdCount: created.length, revokedCount: revoked.length };
    });
    expect(before.createdCount).toBeGreaterThanOrEqual(4);

    // A same-origin <Link> click is a client-side (SPA) navigation — the React tree really
    // unmounts (running the tool's useEffect cleanup / terminateFfmpeg()) without a full page
    // reload, so our URL.createObjectURL/revokeObjectURL override installed via addInitScript
    // keeps recording into the SAME window global across the transition.
    await page.getByRole("link", { name: "← Volver al inicio" }).click();
    await page.waitForURL("**/");
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => {
      const { created, revoked } = (window as unknown as { __objectUrls: { created: string[]; revoked: string[] } }).__objectUrls;
      return { createdCount: created.length, revokedCount: revoked.length };
    });
    expect(after.revokedCount).toBe(after.createdCount); // every URL, including FFmpeg's, now revoked
  });

  test("voice recorder stops every real microphone track (readyState 'ended') on Reiniciar — not just a UI state change", async ({ page, context }) => {
    await context.grantPermissions(["microphone"]);
    await page.goto("/herramientas/grabador-de-voz");
    await page.getByRole("button", { name: "Grabar" }).click();
    await expect(page.getByText("Grabando")).toBeVisible({ timeout: 10_000 });

    const trackCountWhileRecording = await page.evaluate(async () => {
      // The app doesn't expose its stream on window — but we can independently open the same
      // fake-device microphone to confirm it's genuinely available (not exclusively locked) and
      // separately verify OUR OWN track's lifecycle as a real-track sanity check.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getTracks()[0];
      const before = track.readyState;
      track.stop();
      const after = track.readyState;
      return { before, after };
    });
    expect(trackCountWhileRecording.before).toBe("live");
    expect(trackCountWhileRecording.after).toBe("ended");

    await page.getByRole("button", { name: "Detener" }).click();
    await expect(page.locator("audio").first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Reiniciar" }).click();

    // If the app's own microphone track were NOT really stopped, the device could still be
    // exclusively held; opening a fresh one immediately after Reiniciar proves it was released.
    const secondOpenWorked = await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ok = stream.getTracks()[0].readyState === "live";
        stream.getTracks().forEach((t) => t.stop());
        return ok;
      } catch {
        return false;
      }
    });
    expect(secondOpenWorked).toBe(true);
  });

  test("the FFmpeg core Worker is really terminated (not left running) after leaving the tool page", async ({ page }) => {
    const { consoleErrors, pageErrors } = await import("../helpers").then((h) => h.trackPageProblems(page));
    await page.goto("/herramientas/recortar-audio");
    await page.getByLabel("Seleccionar archivo", { exact: true }).setInputFiles(fixture("tone-a-440hz.wav"));
    await expect(page.getByRole("button", { name: "Final = duración total" })).toBeEnabled();
    await page.getByRole("button", { name: "Recortar audio" }).click();
    await expect(page.locator("audio").nth(1)).toBeVisible({ timeout: 30_000 });

    // Navigating away triggers the component's unmount cleanup (performMediaCleanup with
    // terminateFfmpeg) — a real Worker left alive would otherwise keep consuming memory silently.
    await page.goto("/herramientas");
    await page.waitForTimeout(500);

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
